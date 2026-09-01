#pragma once
#ifndef AUTH_H
#define AUTH_H

#include <string>
#include <vector>
#include <atomic>
#include <mutex>

std::string GenerateHWID();

// IMPORTANTE: O 'productHash' deve ser copiado diretamente do Painel Admin (campo 'Hash' do produto).
// Ele é usado pela API para vincular esta key a este produto específico, impedindo o uso de keys de outros produtos.
bool SetProductHash(const std::string& productHash, std::string& error_message);
std::string GetProductHash();
void ClearProductHash();

// licenseKey  = key gerada no painel (ex: SPECTRE-ABC123-DEF456-GHI)
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
