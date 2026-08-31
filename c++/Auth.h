#pragma once
#ifndef AUTH_H
#define AUTH_H

#include <string>
#include <vector>
#include <atomic>
#include <mutex>

std::string GenerateHWID();

bool SetProductHash(const std::string& productHash, std::string& error_message);
std::string GetProductHash();
void ClearProductHash();

// licenseKey  = key gerada no painel (ex: NASH-ABC123-DEF456-GHI)
// hwid        = resultado de GenerateHWID() — passe "" para gerar automatico
// productHash = hash SHA-256 do produto (64 hex chars) — use SetProductHash() antes
bool PerformLogin(
    const std::string& licenseKey,
    const std::string& hwid,
    std::string& error_message,
    const std::string& productHash = ""
);

void CleanupAuth();

#endif
