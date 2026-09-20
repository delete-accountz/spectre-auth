#pragma once

#include <string>

namespace SpectreFiles
{
    struct DownloadResult
    {
        bool success = false;
        std::string path;
        std::string error;
    };

    // Downloads the latest file from the Spectre API and saves it to
    // the current Windows user's Temp directory.
    //
    // Example:
    // auto result = SpectreFiles::DownloadLatestFile(
    //     "https://your-api.up.railway.app",
    //     "MyLoader.dll"
    // );
    DownloadResult DownloadLatestFile(
        const std::string& apiBaseUrl,
        const std::string& fileName
    );
}
