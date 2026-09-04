#pragma once
#ifndef AUTH_H
#define AUTH_H

#include <string>

// Namespace onde os dados da sessão serão salvos após o login
namespace Auth {
    inline std::string SessionToken = "";
    inline std::string ProductName = "";
    inline std::string LoaderHash = "SpectreLoader"; // Nome do seu loader
    inline int dias_restantes = 0;
    inline bool Autenticado = false;
}

// Gera o HWID automaticamente (Hardware + SID do Windows)
std::string GenerateHWID();

// Define o hash do produto (OBRIGATÓRIO chamar antes do login)
bool SetProductHash(const std::string& productHash, std::string& error_message);

// Obtém o hash definido
std::string GetProductHash();

// Limpa o hash da memória
void ClearProductHash();

// Realiza o login na API
// licenseKey  = key gerada no painel
// hwid        = resultado de GenerateHWID() — passe "" para gerar automatico
// error_message = recebe o motivo da falha, se houver
// productHash = hash SHA-256 do produto (64 hex chars)
bool PerformLogin(
    const std::string& licenseKey,
    const std::string& hwid,
    std::string& error_message,
    const std::string& productHash = ""
);

// Limpa a conexão HTTP e recursos do Curl ao fechar o loader
void CleanupAuth();

#endif