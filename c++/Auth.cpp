// IMPORTANTE: O 'productHash' deve ser copiado diretamente do Painel Admin (campo 'Hash' do produto).
// Ele é usado pela API para vincular esta key a este produto específico, impedindo o uso de keys de outros produtos.

#include <windows.h>
#include <Wbemidl.h>
#include <comdef.h>
#include <bcrypt.h>
#include <sddl.h>
#include <algorithm>
#include <mutex>
#include <winhttp.h>
#include <cstdlib>
#include "Auth.h"

#include "Cfg/nlohmann/json.hpp"
#include "Imports/Scope.h" // AuthStruct Auth

#pragma comment(lib, "wbemuuid.lib")
#pragma comment(lib, "bcrypt.lib")
#pragma comment(lib, "winhttp.lib")
#pragma comment(lib, "advapi32.lib")

// IMPORTANTE: O 'productHash' deve ser copiado diretamente do Painel Admin (campo 'Hash' do produto).
// Ele é usado pela API para vincular esta key a este produto específico, impedindo o uso de keys de outros produtos.
// Cole abaixo o valor de 64 caracteres hex (SHA-256) do produto. Não use o Name nem o ID no lugar do Hash.

using json = nlohmann::json;

// ======================================================
// Config
// ======================================================
static constexpr const char* SAFETY_API_HOST = "web-production-d49df.up.railway.app";
static constexpr const int SAFETY_API_PORT = 443; // HTTPS

// Cole aqui o Hash do produto (64 hex) copiado do Painel Admin → Produtos → Hash.
static constexpr const char* PRODUCT_HASH = "";

// ======================================================
// WinHTTP Wrapper
// ======================================================
class WinHttpClient {
private:
    HINTERNET hSession;
    HINTERNET hConnect;
    bool initialized;

public:
    WinHttpClient() : hSession(nullptr), hConnect(nullptr), initialized(false) {}

    ~WinHttpClient() {
        Cleanup();
    }

    bool Initialize() {
        if (initialized) return true;

        // Converter USER_AGENT para wide string
        LPCWSTR userAgent = L"SafetyLoader/1.0";

        hSession = WinHttpOpen(userAgent,
            WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
            WINHTTP_NO_PROXY_NAME,
            WINHTTP_NO_PROXY_BYPASS, 0);

        if (!hSession) return false;

        LPCWSTR hostName = L"web-production-d49df.up.railway.app";
        hConnect = WinHttpConnect(hSession,
            hostName,
            INTERNET_DEFAULT_HTTPS_PORT, 0);

        if (!hConnect) {
            WinHttpCloseHandle(hSession);
            hSession = nullptr;
            return false;
        }

        initialized = true;
        return true;
    }

    bool Request(const std::string& method,
        const std::string& path,
        const std::string& jsonBody,
        long& outHttpCode,
        std::string& outBody,
        std::string& outErr) {

        outBody.clear();
        outHttpCode = 0;

        if (!initialized && !Initialize()) {
            outErr = "WinHTTP initialization failed";
            return false;
        }

        // Converter method para wide string
        int methodLen = MultiByteToWideChar(CP_UTF8, 0, method.c_str(), -1, nullptr, 0);
        std::wstring wmethod(methodLen, L'\0');
        MultiByteToWideChar(CP_UTF8, 0, method.c_str(), -1, &wmethod[0], methodLen);

        // Converter path para wide string
        int pathLen = MultiByteToWideChar(CP_UTF8, 0, path.c_str(), -1, nullptr, 0);
        std::wstring wpath(pathLen, L'\0');
        MultiByteToWideChar(CP_UTF8, 0, path.c_str(), -1, &wpath[0], pathLen);

        HINTERNET hRequest = WinHttpOpenRequest(hConnect,
            wmethod.c_str(),
            wpath.c_str(),
            NULL,
            WINHTTP_NO_REFERER,
            WINHTTP_DEFAULT_ACCEPT_TYPES,
            WINHTTP_FLAG_SECURE);

        if (!hRequest) {
            outErr = "Failed to create request";
            return false;
        }

        // Configurar timeouts
        WinHttpSetTimeouts(hRequest, 6000, 6000, 6000, 15000);

        // Adicionar headers (como wide string)
        LPCWSTR headers = L"Content-Type: application/json\r\nAccept: application/json\r\n";
        WinHttpAddRequestHeaders(hRequest,
            headers,
            (DWORD)wcslen(headers),
            WINHTTP_ADDREQ_FLAG_ADD);

        // Enviar request
        BOOL sent = WinHttpSendRequest(hRequest,
            WINHTTP_NO_ADDITIONAL_HEADERS, 0,
            (method == "POST") ? (LPVOID)jsonBody.c_str() : WINHTTP_NO_REQUEST_DATA,
            (method == "POST") ? (DWORD)jsonBody.length() : 0,
            (method == "POST") ? (DWORD)jsonBody.length() : 0,
            0);

        if (!sent) {
            DWORD err = GetLastError();
            outErr = "Send failed: " + std::to_string(err);
            WinHttpCloseHandle(hRequest);
            return false;
        }

        if (!WinHttpReceiveResponse(hRequest, nullptr)) {
            outErr = "Receive response failed";
            WinHttpCloseHandle(hRequest);
            return false;
        }

        // Obter código HTTP
        DWORD statusCode = 0;
        DWORD statusCodeSize = sizeof(statusCode);
        WinHttpQueryHeaders(hRequest,
            WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
            WINHTTP_HEADER_NAME_BY_INDEX,
            &statusCode,
            &statusCodeSize,
            WINHTTP_NO_HEADER_INDEX);
        outHttpCode = statusCode;

        // Ler resposta
        DWORD bytesAvailable = 0;
        std::vector<char> buffer(4096);

        do {
            bytesAvailable = 0;
            if (!WinHttpQueryDataAvailable(hRequest, &bytesAvailable)) {
                break;
            }

            if (bytesAvailable > 0) {
                buffer.resize(bytesAvailable);
                DWORD bytesRead = 0;

                if (WinHttpReadData(hRequest, buffer.data(), bytesAvailable, &bytesRead)) {
                    outBody.append(buffer.data(), bytesRead);
                }
            }
        } while (bytesAvailable > 0);

        WinHttpCloseHandle(hRequest);
        return true;
    }

    void Cleanup() {
        if (hConnect) {
            WinHttpCloseHandle(hConnect);
            hConnect = nullptr;
        }
        if (hSession) {
            WinHttpCloseHandle(hSession);
            hSession = nullptr;
        }
        initialized = false;
    }
};

// ======================================================
// Global client instance
// ======================================================
static WinHttpClient g_httpClient;
static std::mutex g_productHashMutex;
static std::string g_productHash;
static std::string g_sidStr;

// ======================================================
// Utils (mantidos iguais)
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
        return (c >= '0' && c <= '9') ||
               (c >= 'a' && c <= 'f') ||
               (c >= 'A' && c <= 'F');
    });
}

static std::string NormalizeProductHash(const std::string& value) {
    std::string clean = TrimCopy(value);
    ToLowerInPlace(clean);
    return clean;
}

bool SetProductHash(const std::string& productHash, std::string& error_message) {
    // IMPORTANTE: O 'productHash' deve ser copiado diretamente do Painel Admin (campo 'Hash' do produto).
    // Ele é usado pela API para vincular esta key a este produto específico, impedindo o uso de keys de outros produtos.
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

static std::string Sha256Hex(const std::string& input) {
    BCRYPT_ALG_HANDLE hAlg = NULL;
    BCRYPT_HASH_HANDLE hHash = NULL;

    DWORD hashObjLen = 0, cbData = 0, hashLen = 0;
    std::string out;

    if (BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_SHA256_ALGORITHM, NULL, 0) != 0)
        return "";

    if (BCryptGetProperty(hAlg, BCRYPT_OBJECT_LENGTH, (PUCHAR)&hashObjLen, sizeof(DWORD), &cbData, 0) != 0) {
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    if (BCryptGetProperty(hAlg, BCRYPT_HASH_LENGTH, (PUCHAR)&hashLen, sizeof(DWORD), &cbData, 0) != 0) {
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    std::vector<BYTE> hashObj(hashObjLen);

    if (BCryptCreateHash(hAlg, &hHash, hashObj.data(), hashObjLen, NULL, 0, 0) != 0) {
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    if (BCryptHashData(hHash, (PUCHAR)input.data(), (ULONG)input.size(), 0) != 0) {
        BCryptDestroyHash(hHash);
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    std::vector<BYTE> hash(hashLen);

    if (BCryptFinishHash(hHash, hash.data(), hashLen, 0) != 0) {
        BCryptDestroyHash(hHash);
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
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

static bool SafetyHealth(std::string& err) {
    long code = 0;
    std::string body;

    if (g_httpClient.Request("GET", "/v1/health", "", code, body, err)) {
        if (code >= 200 && code < 300) return true;
        err = JsonMessageOrFallback(body, "API health check failed");
    }

    return false;
}

// ======================================================
// HWID Generation (mantido igual)
// ======================================================
static bool WmiQuerySingleString(const wchar_t* wql, const wchar_t* field, std::string& out) {
    out.clear();

    HRESULT hr = CoInitializeEx(0, COINIT_MULTITHREADED);
    if (FAILED(hr) && hr != RPC_E_CHANGED_MODE)
        return false;

    CoInitializeSecurity(
        NULL, -1, NULL, NULL,
        RPC_C_AUTHN_LEVEL_DEFAULT,
        RPC_C_IMP_LEVEL_IMPERSONATE,
        NULL, EOAC_NONE, NULL
    );

    IWbemLocator* pLoc = nullptr;
    IWbemServices* pSvc = nullptr;

    hr = CoCreateInstance(CLSID_WbemLocator, 0, CLSCTX_INPROC_SERVER, IID_IWbemLocator, (LPVOID*)&pLoc);
    if (FAILED(hr)) {
        CoUninitialize();
        return false;
    }

    hr = pLoc->ConnectServer(_bstr_t(L"ROOT\\CIMV2"), NULL, NULL, 0, NULL, 0, 0, &pSvc);
    if (FAILED(hr)) {
        pLoc->Release();
        CoUninitialize();
        return false;
    }

    CoSetProxyBlanket(
        pSvc,
        RPC_C_AUTHN_WINNT,
        RPC_C_AUTHZ_NONE,
        NULL,
        RPC_C_AUTHN_LEVEL_CALL,
        RPC_C_IMP_LEVEL_IMPERSONATE,
        NULL,
        EOAC_NONE
    );

    IEnumWbemClassObject* pEnumerator = nullptr;
    hr = pSvc->ExecQuery(
        bstr_t("WQL"),
        bstr_t(wql),
        WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY,
        NULL,
        &pEnumerator
    ); 

    if (FAILED(hr) || !pEnumerator) {
        pSvc->Release();
        pLoc->Release();
        CoUninitialize();
        return false;
    }

    IWbemClassObject* pObj = nullptr;
    ULONG ret = 0;

    bool ok = false;
    if (pEnumerator->Next(WBEM_INFINITE, 1, &pObj, &ret) == S_OK && pObj) {
        VARIANT vt{};
        VariantInit(&vt);

        if (SUCCEEDED(pObj->Get(field, 0, &vt, 0, 0)) && vt.vt == VT_BSTR && vt.bstrVal) {
            _bstr_t b(vt.bstrVal);
            out = (const char*)b;
            out = TrimCopy(out);
            ok = !out.empty();
        }

        VariantClear(&vt);
        pObj->Release();
    }

    pEnumerator->Release();
    pSvc->Release();
    pLoc->Release();
    CoUninitialize();
    return ok;
}

std::string GenerateHWID() {
    // ── Método 1: WMI (hardware físico) ──────────────────────────────────
    std::string motherboardSerial, cpuId, biosSerial, diskSerial;
    WmiQuerySingleString(L"SELECT SerialNumber FROM Win32_BaseBoard", L"SerialNumber", motherboardSerial);
    WmiQuerySingleString(L"SELECT ProcessorId FROM Win32_Processor",  L"ProcessorId",  cpuId);
    WmiQuerySingleString(L"SELECT SerialNumber FROM Win32_BIOS",       L"SerialNumber", biosSerial);
    WmiQuerySingleString(L"SELECT SerialNumber FROM Win32_PhysicalMedia", L"SerialNumber", diskSerial);

    // ── Método 2: SID do usuário Windows (igual KeyAuth) ─────────────────
    std::string sidStr = "unknown_sid";
    HANDLE hToken = nullptr;
    if (OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &hToken))
    {
        DWORD dwSize = 0;
        GetTokenInformation(hToken, TokenUser, nullptr, 0, &dwSize);
        if (dwSize > 0)
        {
            std::vector<BYTE> buf(dwSize);
            if (GetTokenInformation(hToken, TokenUser, buf.data(), dwSize, &dwSize))
            {
                TOKEN_USER* pUser = reinterpret_cast<TOKEN_USER*>(buf.data());
                LPWSTR pSid = nullptr;
                if (ConvertSidToStringSidW(pUser->User.Sid, &pSid) && pSid)
                {
                    std::wstring ws(pSid);
                    sidStr = std::string(ws.begin(), ws.end());
                    LocalFree(pSid);
                }
            }
        }
        CloseHandle(hToken);
    }

    // ── Combina tudo num único hash SHA-256 ───────────────────────────────
    std::string raw = motherboardSerial + "-" + cpuId + "-" + biosSerial + "-" + diskSerial + "-" + sidStr;
    raw = TrimCopy(raw);

    // Armazena o SID globalmente para ser enviado no payload
    {
        std::lock_guard<std::mutex> lock(g_productHashMutex);
        g_sidStr = sidStr;
    }

    std::string hash = Sha256Hex(raw);
    if (hash.empty()) return "unknown";
    return hash;
}

// ======================================================
// PerformLogin
// ======================================================
bool PerformLogin(const std::string& licenseKey, const std::string& hwid, std::string& error_message, const std::string& productHash) {
    std::string keyClean = TrimCopy(licenseKey);
    std::string hw       = TrimCopy(hwid);
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

    if (keyClean.empty()) {
        error_message = "License key vazia.";
        return false;
    }
    ToUpperInPlace(keyClean);
    if (keyClean.size() < 10 || keyClean.size() > 80) {
        error_message = "License key invalida.";
        return false;
    }
    if (!IsHex64(effectiveProductHash)) {
        error_message = "productHash invalido. Use SetProductHash() ou defina SAFETY_PRODUCT_HASH.";
        return false;
    }

    // Health check (uma vez por processo)
    static bool s_initialized = false;
    if (!s_initialized) {
        std::string herr;
        if (!SafetyHealth(herr)) {
            error_message = "api offline -> " + herr;
            return false;
        }
        s_initialized = true;
    }

    // Pega o SID para enviar no payload
    std::string currentSid;
    {
        std::lock_guard<std::mutex> lock(g_productHashMutex);
        currentSid = g_sidStr;
    }

    // Payload: licenseKey + hwid + sid + productHash
    json payload = {
        {"licenseKey",  keyClean},
        {"hwid",        hw},
        {"sid",         currentSid},
        {"productHash", effectiveProductHash},
        {"client", {
            {"name",     Auth.LoaderHash.empty() ? "loader" : Auth.LoaderHash},
            {"version",  "1.0.0"},
            {"platform", "win"}
        }}
    };

    std::string bodyReq = payload.dump();

    long code = 0;
    std::string bodyResp, httpErr;

    if (!g_httpClient.Request("POST", "/v1/auth/login", bodyReq, code, bodyResp, httpErr)) {
        error_message = "HTTP connection error: " + httpErr;
        return false;
    }

    if (code < 200 || code >= 300) {
        error_message = JsonMessageOrFallback(bodyResp, "Login failed. Status: " + std::to_string(code));
        return false;
    }

    json j = json::parse(bodyResp, nullptr, false);
    if (j.is_discarded()) {
        error_message = "Invalid JSON response";
        return false;
    }

    // Processar resposta
    int daysLeft = 0;
    try {
        if (j.contains("data") && j["data"].is_object()) {
            auto& d = j["data"];
            if (d.contains("daysLeft")) {
                if (d["daysLeft"].is_number_integer()) daysLeft = d["daysLeft"].get<int>();
                else if (d["daysLeft"].is_string()) daysLeft = std::stoi(d["daysLeft"].get<std::string>());
            }

            if (d.contains("token") && d["token"].is_string())
                Auth.SessionToken = d["token"].get<std::string>();
        }

        if (Auth.SessionToken.empty() && j.contains("requestId") && j["requestId"].is_string())
            Auth.SessionToken = j["requestId"].get<std::string>();
    }
    catch (...) {
    }

    try {
        if (j.contains("data") && j["data"].is_object()) {
            auto& d = j["data"];
            if (d.contains("user") && d["user"].is_object()) {
                auto& u = d["user"];

                if (u.contains("username") && u["username"].is_string()) {
                    std::string uname = u["username"].get<std::string>();
                    if (!uname.empty()) {
                        strncpy_s(Auth.Usuario, uname.c_str(), sizeof(Auth.Usuario) - 1);
                        Auth.Usuario[sizeof(Auth.Usuario) - 1] = '\0';
                    }
                }

                if (u.contains("avatarUrl") && u["avatarUrl"].is_string()) {
                    std::string url = u["avatarUrl"].get<std::string>();
                    if (!url.empty()) {
                        strncpy_s(Auth.DiscordAvatarUrl, url.c_str(), sizeof(Auth.DiscordAvatarUrl) - 1);
                        Auth.DiscordAvatarUrl[sizeof(Auth.DiscordAvatarUrl) - 1] = '\0';
                    }
                }
            }
        }
    }
    catch (...) {
    }

    Auth.dias_restantes = daysLeft;
    Auth.Autenticado = true;

    error_message = JsonMessageOrFallback(bodyResp, "Authorized");
    return true;
}

// ======================================================
// Cleanup
// ======================================================
void CleanupAuth() {
    g_httpClient.Cleanup();
}