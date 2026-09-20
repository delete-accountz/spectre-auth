#include "FileDownloader.hpp"

#include <windows.h>
#include <winhttp.h>

#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#pragma comment(lib, "winhttp.lib")

namespace
{
    std::wstring ToWide(const std::string& value)
    {
        if (value.empty())
            return {};

        const int size = MultiByteToWideChar(
            CP_UTF8, 0, value.data(), static_cast<int>(value.size()),
            nullptr, 0
        );

        std::wstring result(size, L'\\0');

        MultiByteToWideChar(
            CP_UTF8, 0, value.data(), static_cast<int>(value.size()),
            result.data(), size
        );

        return result;
    }

    std::string GetTempDirectory()
    {
        wchar_t buffer[MAX_PATH]{};

        const DWORD length = GetTempPathW(
            static_cast<DWORD>(std::size(buffer)),
            buffer
        );

        if (length == 0 || length >= std::size(buffer))
            return {};

        return std::filesystem::path(buffer).string();
    }

    bool SplitUrl(
        const std::string& url,
        bool& secure,
        std::wstring& host,
        std::wstring& path
    )
    {
        const std::string httpsPrefix = "https://";
        const std::string httpPrefix = "http://";

        std::string remainder;

        if (url.rfind(httpsPrefix, 0) == 0)
        {
            secure = true;
            remainder = url.substr(httpsPrefix.size());
        }
        else if (url.rfind(httpPrefix, 0) == 0)
        {
            secure = false;
            remainder = url.substr(httpPrefix.size());
        }
        else
        {
            return false;
        }

        const auto slash = remainder.find('/');

        if (slash == std::string::npos)
        {
            host = ToWide(remainder);
            path = L"/";
        }
        else
        {
            host = ToWide(remainder.substr(0, slash));
            path = ToWide(remainder.substr(slash));
        }

        return !host.empty();
    }
}

namespace SpectreFiles
{
    DownloadResult DownloadLatestFile(
        const std::string& apiBaseUrl,
        const std::string& fileName
    )
    {
        DownloadResult result;

        if (apiBaseUrl.empty() || fileName.empty())
        {
            result.error = "API URL or file name is empty.";
            return result;
        }

        // The existing API described in the project uses:
        // GET /v1/files/:name
        //
        // Important: this endpoint must return the actual file bytes for this
        // example to work directly. If your endpoint returns JSON metadata,
        // use the returned download URL/ID and request:
        // GET /v1/files/:id/download
        const std::string url =
            apiBaseUrl + "/v1/files/" + fileName;

        bool secure = false;
        std::wstring host;
        std::wstring path;

        if (!SplitUrl(url, secure, host, path))
        {
            result.error = "Invalid API URL.";
            return result;
        }

        HINTERNET session = WinHttpOpen(
            L"Spectre-File-Client/1.0",
            WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
            WINHTTP_NO_PROXY_NAME,
            WINHTTP_NO_PROXY_BYPASS,
            0
        );

        if (!session)
        {
            result.error = "WinHttpOpen failed.";
            return result;
        }

        HINTERNET connection = WinHttpConnect(
            session,
            host.c_str(),
            INTERNET_DEFAULT_HTTPS_PORT,
            0
        );

        if (!connection)
        {
            WinHttpCloseHandle(session);
            result.error = "WinHttpConnect failed.";
            return result;
        }

        const DWORD flags = secure ? WINHTTP_FLAG_SECURE : 0;

        HINTERNET request = WinHttpOpenRequest(
            connection,
            L"GET",
            path.c_str(),
            nullptr,
            WINHTTP_NO_REFERER,
            WINHTTP_DEFAULT_ACCEPT_TYPES,
            flags
        );

        if (!request)
        {
            WinHttpCloseHandle(connection);
            WinHttpCloseHandle(session);
            result.error = "WinHttpOpenRequest failed.";
            return result;
        }

        bool ok = WinHttpSendRequest(
            request,
            WINHTTP_NO_ADDITIONAL_HEADERS,
            0,
            WINHTTP_NO_REQUEST_DATA,
            0,
            0,
            0
        );

        if (ok)
            ok = WinHttpReceiveResponse(request, nullptr);

        if (!ok)
        {
            result.error = "HTTP request failed.";
            WinHttpCloseHandle(request);
            WinHttpCloseHandle(connection);
            WinHttpCloseHandle(session);
            return result;
        }

        DWORD statusCode = 0;
        DWORD statusSize = sizeof(statusCode);

        WinHttpQueryHeaders(
            request,
            WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
            WINHTTP_HEADER_NAME_BY_INDEX,
            &statusCode,
            &statusSize,
            WINHTTP_NO_HEADER_INDEX
        );

        if (statusCode != 200)
        {
            result.error = "Server returned HTTP status " +
                           std::to_string(statusCode) + ".";

            WinHttpCloseHandle(request);
            WinHttpCloseHandle(connection);
            WinHttpCloseHandle(session);
            return result;
        }

        const std::string tempDirectory = GetTempDirectory();

        if (tempDirectory.empty())
        {
            result.error = "Could not determine Windows Temp directory.";

            WinHttpCloseHandle(request);
            WinHttpCloseHandle(connection);
            WinHttpCloseHandle(session);
            return result;
        }

        // For a real application, use a server-provided safe filename or a
        // generated filename instead of trusting arbitrary user input.
        const std::filesystem::path outputPath =
            std::filesystem::path(tempDirectory) /
            std::filesystem::path(fileName).filename();

        std::ofstream output(
            outputPath,
            std::ios::binary | std::ios::trunc
        );

        if (!output)
        {
            result.error = "Could not create the output file.";
            WinHttpCloseHandle(request);
            WinHttpCloseHandle(connection);
            WinHttpCloseHandle(session);
            return result;
        }

        std::vector<BYTE> buffer(64 * 1024);

        while (true)
        {
            DWORD bytesAvailable = 0;

            if (!WinHttpQueryDataAvailable(
                    request,
                    &bytesAvailable))
            {
                result.error = "Failed to query response data.";
                output.close();
                WinHttpCloseHandle(request);
                WinHttpCloseHandle(connection);
                WinHttpCloseHandle(session);
                return result;
            }

            if (bytesAvailable == 0)
                break;

            std::vector<BYTE> chunk(
                std::min<DWORD>(
                    bytesAvailable,
                    static_cast<DWORD>(buffer.size())
                )
            );

            DWORD bytesRead = 0;

            if (!WinHttpReadData(
                    request,
                    chunk.data(),
                    static_cast<DWORD>(chunk.size()),
                    &bytesRead))
            {
                result.error = "Failed to read downloaded file.";
                output.close();
                WinHttpCloseHandle(request);
                WinHttpCloseHandle(connection);
                WinHttpCloseHandle(session);
                return result;
            }

            if (bytesRead == 0)
                break;

            output.write(
                reinterpret_cast<const char*>(chunk.data()),
                bytesRead
            );

            if (!output)
            {
                result.error = "Failed to write downloaded file.";
                output.close();
                WinHttpCloseHandle(request);
                WinHttpCloseHandle(connection);
                WinHttpCloseHandle(session);
                return result;
            }
        }

        output.close();

        WinHttpCloseHandle(request);
        WinHttpCloseHandle(connection);
        WinHttpCloseHandle(session);

        result.success = true;
        result.path = outputPath.string();

        return result;
    }
}
