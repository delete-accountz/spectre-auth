#include <windows.h>
#include <Wbemidl.h>
#include <comdef.h>
#include <bcrypt.h>
#include <sddl.h>
#include <algorithm>
#include <mutex>
#include <cstdlib>
#include <vector>
#include <curl/curl.h>

#include "Auth.h"
#include "json.hpp"

#pragma comment(lib, "wbemuuid.lib")
#pragma comment(lib, "bcrypt.lib")
#pragma comment(lib, "advapi32.lib")
#pragma comment(lib, "libcurl.lib") // Certifique-se de que está linkando o libcurl corretamente
#pragma comment(lib, "ws2_32.lib")  // Dependência do Curl no Windows

using json = nlohmann::json;

// ======================================================
// Configuração da API
// ======================================================
static constexpr const char* API_HOST = "spectre-auth-production-13a2.up.railway.app"; // Sem https://
static constexpr const int API_PORT = 443;
static constexpr const char* PRODUCT_HASH = "hash do seu produto";

// ======================================================
// Curl HTTP Client Wrapper
// ======================================================
class CurlHttpClient {
private:
    CURL* curl;
    bool initialized;

    static size_t WriteCallback(void* contents, size_t size, size_t nmemb, std::string* userp) {
        size_t totalSize = size * nmemb;
        userp->append((char*)contents, totalSize);
        return totalSize;
    }

public:
    CurlHttpClient() : curl(nullptr), initialized(false) {}
    ~CurlHttpClient() { Cleanup(); }

    bool Initialize() {
        if (initialized) return true;
        curl_global_init(CURL_GLOBAL_DEFAULT);
        curl = curl_easy_init();
        if (!curl) return false;
        initialized = true;
        return true;
    }

    bool Request(const std::string& method, const std::string& url, const std::string& jsonBody, 
                 long& outHttpCode, std::string& outBody, std::string& outErr) {
        outBody.clear();
        outHttpCode = 0;

        if (!initialized && !Initialize()) {
            outErr = "Curl initialization failed";
            return false;
        }

        curl_easy_reset(curl);
        curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
        curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 1L);
        curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 2L);
        curl_easy_setopt(curl, CURLOPT_TIMEOUT, 15L);
        curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 5L);

        struct curl_slist* headers = nullptr;
        headers = curl_slist_append(headers, "Content-Type: application/json");
        headers = curl_slist_append(headers, "Accept: application/json");
        curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);

        if (method == "POST") {
            curl_easy_setopt(curl, CURLOPT_POST, 1L);
            curl_easy_setopt(curl, CURLOPT_POSTFIELDS, jsonBody.c_str());
            curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, jsonBody.length());
        }

        curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
        curl_easy_setopt(curl, CURLOPT_WRITEDATA, &outBody);

        CURLcode res = curl_easy_perform(curl);
        if (res != CURLE_OK) {
            outErr = curl_easy_strerror(res);
            curl_slist_free_all(headers);
            return false;
        }

        curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &outHttpCode);
        curl_slist_free_all(headers);
        return true;
    }

    void Cleanup() {
        if (curl) {
            curl_easy_cleanup(curl);
            curl = nullptr;
        }
        curl_global_cleanup();
        initialized = false;
    }
};

// ======================================================
// Instância Global do Cliente
// ======================================================
static CurlHttpClient g_httpClient;
static std::mutex g_productHashMutex;
static std::string g_productHash;
static std::string g_sidStr;

// ======================================================
// Utilitários de String
// ======================================================
static inline std::string TrimCopy(std::string s) {
    auto notSpace = [](unsigned char c) { return !std::isspace(c); };
    s.erase(s.begin(), std::find_if(s.begin(), s.end(), notSpace));
    s.erase(std::find_if(s.rbegin(), s.rend(), notSpace).base(), s.end());
    return s;
}

static inline void ToUpperInPlace(std::string& s) {
    std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) { return (char)std::toupper(c); });
}

static inline void ToLowerInPlace(std::string& s) {
    std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) { return (char)std::tolower(c); });
}

static bool IsHex64(const std::string& value) {
    if (value.size() != 64) return false;
    return std::all_of(value.begin(), value.end(), [](unsigned char c) {
        return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
    });
}

static std::string NormalizeProductHash(const std::string& value) {
    std::string clean = TrimCopy(value);
    ToLowerInPlace(clean);
    return clean;
}

// ======================================================
// Funções Públicas de Hash
// ======================================================
bool SetProductHash(const std::string& productHash, std::string& error_message) {
    std::string clean = NormalizeProductHash(productHash);
    if (!IsHex64(clean)) {
        error_message = "Invalid productHash. Expected SHA-256 hex (64 chars).";
        return false;
    }
    {
        std::lock_guard<std::mutex> lock(g_productHashMutex);
        g_productHash = clean;
    }
    error_message.clear();
    return true;
}

std::string GetProductHash() {
    std::lock_guard<std::mutex> lock(g_productHashMutex);
    return g_productHash;
}

void ClearProductHash() {
    std::lock_guard<std::mutex> lock(g_productHashMutex);
    g_productHash.clear();
}

// ======================================================
// SHA-256 via BCrypt
// ======================================================
static std::string Sha256Hex(const std::string& input) {
    BCRYPT_ALG_HANDLE hAlg = NULL;
    BCRYPT_HASH_HANDLE hHash = NULL;
    DWORD hashObjLen = 0, cbData = 0, hashLen = 0;
    std::string out;

    if (BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_SHA256_ALGORITHM, NULL, 0) != 0) return "";
    if (BCryptGetProperty(hAlg, BCRYPT_OBJECT_LENGTH, (PUCHAR)&hashObjLen, sizeof(DWORD), &cbData, 0) != 0) {
        BCryptCloseAlgorithmProvider(hAlg, 0); return "";
    }
    if (BCryptGetProperty(hAlg, BCRYPT_HASH_LENGTH, (PUCHAR)&hashLen, sizeof(DWORD), &cbData, 0) != 0) {
        BCryptCloseAlgorithmProvider(hAlg, 0); return "";
    }

    std::vector<BYTE> hashObj(hashObjLen);
    if (BCryptCreateHash(hAlg, &hHash, hashObj.data(), hashObjLen, NULL, 0, 0) != 0) {
        BCryptCloseAlgorithmProvider(hAlg, 0); return "";
    }
    if (BCryptHashData(hHash, (PUCHAR)input.data(), (ULONG)input.size(), 0) != 0) {
        BCryptDestroyHash(hHash); BCryptCloseAlgorithmProvider(hAlg, 0); return "";
    }

    std::vector<BYTE> hash(hashLen);
    if (BCryptFinishHash(hHash, hash.data(), hashLen, 0) != 0) {
        BCryptDestroyHash(hHash); BCryptCloseAlgorithmProvider(hAlg, 0); return "";
    }

    BCryptDestroyHash(hHash);
    BCryptCloseAlgorithmProvider(hAlg, 0);

    static const char* hex = "0123456789abcdef";
    out.reserve(hash.size() * 2);
    for (unsigned char b : hash) {
        out.push_back(hex[(b >> 4) & 0xF]);
        out.push_back(hex[b & 0xF]);
    }
    return out;
}

// ======================================================
// JSON Helpers
// ======================================================
static std::string JsonMessageOrFallback(const std::string& body, const std::string& fallback) {
    if (body.empty()) return fallback;
    json j = json::parse(body, nullptr, false);
    if (j.is_discarded()) {
        if (body.size() > 220) return body.substr(0, 220) + "...";
        return body;
    }
    if (j.contains("message") && j["message"].is_string()) {
        auto m = j["message"].get<std::string>();
        if (!m.empty()) return m;
    }
    if (j.contains("error") && j["error"].is_object()) {
        auto& e = j["error"];
        if (e.contains("code") && e["code"].is_string()) {
            auto c = e["code"].get<std::string>();
            if (!c.empty()) return c;
        }
    }
    return fallback;
}

// ======================================================
// Health Check
// ======================================================
static bool SafetyHealth(std::string& err) {
    long code = 0;
    std::string body;
    std::string url = std::string("https://") + API_HOST + "/v1/health";
    
    if (g_httpClient.Request("GET", url, "", code, body, err)) {
        if (code >= 200 && code < 300) return true;
        err = JsonMessageOrFallback(body, "API health check failed");
    }
    return false;
}

// ======================================================
// Geração de HWID (WMI + SID)
// ======================================================
static bool WmiQuerySingleString(const wchar_t* wql, const wchar_t* field, std::string& out) {
    out.clear();
    HRESULT hr = CoInitializeEx(0, COINIT_MULTITHREADED);
    if (FAILED(hr) && hr != RPC_E_CHANGED_MODE) return false;

    CoInitializeSecurity(NULL, -1, NULL, NULL, RPC_C_AUTHN_LEVEL_DEFAULT, RPC_C_IMP_LEVEL_IMPERSONATE, NULL, EOAC_NONE, NULL);

    IWbemLocator* pLoc = nullptr;
    IWbemServices* pSvc = nullptr;
    hr = CoCreateInstance(CLSID_WbemLocator, 0, CLSCTX_INPROC_SERVER, IID_IWbemLocator, (LPVOID*)&pLoc);
    if (FAILED(hr)) { CoUninitialize(); return false; }

    hr = pLoc->ConnectServer(_bstr_t(L"ROOT\\CIMV2"), NULL, NULL, 0, NULL, 0, 0, &pSvc);
    if (FAILED(hr)) { pLoc->Release(); CoUninitialize(); return false; }

    CoSetProxyBlanket(pSvc, RPC_C_AUTHN_WINNT, RPC_C_AUTHZ_NONE, NULL, RPC_C_AUTHN_LEVEL_CALL, RPC_C_IMP_LEVEL_IMPERSONATE, NULL, EOAC_NONE);

    IEnumWbemClassObject* pEnumerator = nullptr;
    hr = pSvc->ExecQuery(bstr_t("WQL"), bstr_t(wql), WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY, NULL, &pEnumerator);
    if (FAILED(hr) || !pEnumerator) { pSvc->Release(); pLoc->Release(); CoUninitialize(); return false; }

    IWbemClassObject* pObj = nullptr;
    ULONG ret = 0;
    bool ok = false;

    if (pEnumerator->Next(WBEM_INFINITE, 1, &pObj, &ret) == S_OK && pObj) {
        VARIANT vt{};
        VariantInit(&vt);
        if (SUCCEEDED(pObj->Get(field, 0, &vt, 0, 0)) && vt.vt == VT_BSTR && vt.bstrVal) {
            _bstr_t b(vt.bstrVal);
            out = TrimCopy(std::string((const char*)b));
            ok = !out.empty();
        }
        VariantClear(&vt);
        pObj->Release();
    }
    pEnumerator->Release(); pSvc->Release(); pLoc->Release(); CoUninitialize();
    return ok;
}

std::string GenerateHWID() {
    std::string mb, cpu, bios, disk;
    WmiQuerySingleString(L"SELECT SerialNumber FROM Win32_BaseBoard", L"SerialNumber", mb);
    WmiQuerySingleString(L"SELECT ProcessorId FROM Win32_Processor", L"ProcessorId", cpu);
    WmiQuerySingleString(L"SELECT SerialNumber FROM Win32_BIOS", L"SerialNumber", bios);
    WmiQuerySingleString(L"SELECT SerialNumber FROM Win32_PhysicalMedia", L"SerialNumber", disk);

    std::string sidStr = "unknown_sid";
    HANDLE hToken = nullptr;
    if (OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &hToken)) {
        DWORD dwSize = 0;
        GetTokenInformation(hToken, TokenUser, nullptr, 0, &dwSize);
        if (dwSize > 0) {
            std::vector<BYTE> buf(dwSize);
            if (GetTokenInformation(hToken, TokenUser, buf.data(), dwSize, &dwSize)) {
                TOKEN_USER* pUser = reinterpret_cast<TOKEN_USER*>(buf.data());
                LPWSTR pSid = nullptr;
                if (ConvertSidToStringSidW(pUser->User.Sid, &pSid) && pSid) {
                    std::wstring ws(pSid);
                    sidStr = std::string(ws.begin(), ws.end());
                    LocalFree(pSid);
                }
            }
        }
        CloseHandle(hToken);
    }

    std::string raw = mb + "-" + cpu + "-" + bios + "-" + disk + "-" + sidStr;
    raw = TrimCopy(raw);

    {
        std::lock_guard<std::mutex> lock(g_productHashMutex);
        g_sidStr = sidStr;
    }

    std::string hash = Sha256Hex(raw);
    return hash.empty() ? "unknown" : hash;
}

// ======================================================
// PerformLogin (Lógica Principal)
// ======================================================
bool PerformLogin(const std::string& licenseKey, const std::string& hwid, std::string& error_message, const std::string& productHash) {
    std::string keyClean = TrimCopy(licenseKey);
    std::string hw = TrimCopy(hwid);
    std::string effectiveProductHash = NormalizeProductHash(productHash);

    if (effectiveProductHash.empty()) effectiveProductHash = GetProductHash();
    if (effectiveProductHash.empty()) effectiveProductHash = NormalizeProductHash(PRODUCT_HASH);
    
    if (effectiveProductHash.empty()) {
        char* envHash = nullptr;
        size_t envLen = 0;
        if (_dupenv_s(&envHash, &envLen, "SAFETY_PRODUCT_HASH") == 0 && envHash) {
            effectiveProductHash = NormalizeProductHash(std::string(envHash));
            free(envHash);
        }
    }

    if (keyClean.empty()) { error_message = "License key vazia."; return false; }
    ToUpperInPlace(keyClean);
    if (keyClean.size() < 10 || keyClean.size() > 80) { error_message = "License key invalida."; return false; }
    if (!IsHex64(effectiveProductHash)) { error_message = "productHash invalido."; return false; }

    // Health check (uma vez por processo)
    static bool s_initialized = false;
    if (!s_initialized) {
        std::string herr;
        if (!SafetyHealth(herr)) { error_message = "api offline -> " + herr; return false; }
        s_initialized = true;
    }

    std::string currentSid;
    {
        std::lock_guard<std::mutex> lock(g_productHashMutex);
        currentSid = g_sidStr;
    }

    // Monta o Payload JSON
    json payload = {
        {"licenseKey",  keyClean},
        {"hwid",        hw},
        {"sid",         currentSid},
        {"productHash", effectiveProductHash},
        {"client", {
            {"name",     Auth::LoaderHash.empty() ? "loader" : Auth::LoaderHash},
            {"version",  "1.0.0"},
            {"platform", "win"}
        }}
    };

    std::string bodyReq = payload.dump();
    long code = 0;
    std::string bodyResp, httpErr;
    
    std::string url = std::string("https://") + API_HOST + "/v1/auth/login";

    if (!g_httpClient.Request("POST", url, bodyReq, code, bodyResp, httpErr)) {
        error_message = "HTTP connection error: " + httpErr;
        return false;
    }

    if (code < 200 || code >= 300) {
        error_message = JsonMessageOrFallback(bodyResp, "Login failed. Status: " + std::to_string(code));
        return false;
    }

    json j = json::parse(bodyResp, nullptr, false);
    if (j.is_discarded()) { error_message = "Invalid JSON response"; return false; }

    int daysLeft = 0;
    try {
        if (j.contains("data") && j["data"].is_object()) {
            auto& d = j["data"];
            if (d.contains("daysLeft")) {
                if (d["daysLeft"].is_number_integer()) daysLeft = d["daysLeft"].get<int>();
                else if (d["daysLeft"].is_string()) daysLeft = std::stoi(d["daysLeft"].get<std::string>());
            }
            if (d.contains("token") && d["token"].is_string()) Auth::SessionToken = d["token"].get<std::string>();
            if (d.contains("product") && d["product"].is_object() && d["product"].contains("name")) {
                Auth::ProductName = d["product"]["name"].get<std::string>();
            }
        }
        if (Auth::SessionToken.empty() && j.contains("requestId") && j["requestId"].is_string()) {
            Auth::SessionToken = j["requestId"].get<std::string>();
        }
    } catch (...) {}

    Auth::dias_restantes = daysLeft;
    Auth::Autenticado = true;
    error_message = JsonMessageOrFallback(bodyResp, "Authorized");
    return true;
}

// ======================================================
// Cleanup
// ======================================================
void CleanupAuth() {
    g_httpClient.Cleanup();
}