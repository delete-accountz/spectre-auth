"use client";

import React, { useState, useCallback, useRef } from "react";
import { Header } from "@/components/dashboard/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ModalHeader, ModalTitle, ModalDescription, ModalFooter } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import { toast } from "sonner";
import { useSidebar } from "../layout";
import {
  DocumentDuplicateIcon as FileIcon,
  MagnifyingGlassIcon as Search,
  ChevronLeftIcon as ChevronLeft,
  ChevronRightIcon as ChevronRight,
  ArrowPathIcon as Loader2,
  CalendarDaysIcon as Calendar,
  PlusIcon as Plus,
  ArrowDownTrayIcon as Download,
  TrashIcon as Trash2,
  PencilSquareIcon as Pencil,
  DocumentArrowUpIcon as Upload,
  XMarkIcon as X,
} from "@heroicons/react/24/solid";
import {
  getFiles,
  uploadFile,
  updateFile,
  deleteFile,
  type StoredFileItem,
} from "@/lib/api";

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export default function FilesPage() {
  const { toggle: toggleSidebar } = useSidebar();
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<StoredFileItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<StoredFileItem | null>(null);
  const [uploadFileObj, setUploadFileObj] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [replaceFileObj, setReplaceFileObj] = useState<File | null>(null);
  const [replaceLoading, setReplaceLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    const response = await getFiles(page, 25, { q: searchQuery || undefined });
    
    if (response.success && response.data) {
      setFiles(response.data.items);
      setTotalPages(response.data.pages);
      setTotal(response.data.total);
    }
    setLoading(false);
  }, [page, searchQuery]);

  React.useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearchQuery(searchInput);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['dll', 'exe'].includes(ext)) {
      addToast({
        title: "Erro",
        description: "Apenas arquivos .dll e .exe são permitidos",
        variant: "destructive",
      });
      return;
    }

    setUploadFileObj(file);
    if (!uploadName) {
      setUploadName(file.name.replace(/\.(dll|exe)$/i, ''));
    }
  };

  const handleReplaceSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['dll', 'exe'].includes(ext)) {
      addToast({
        title: "Erro",
        description: "Apenas arquivos .dll e .exe são permitidos",
        variant: "destructive",
      });
      return;
    }

    setReplaceFileObj(file);
  };

  const handleUpload = async () => {
    if (!uploadFileObj) return;

    setUploadLoading(true);
    const response = await uploadFile(uploadFileObj, uploadName || undefined);
    setUploadLoading(false);

    if (response.success) {
      addToast({
        title: "Arquivo enviado",
        description: `${uploadFileObj.name} enviado com sucesso`,
        variant: "success",
      });
      setUploadModalOpen(false);
      setUploadFileObj(null);
      setUploadName("");
      fetchFiles();
    } else {
      addToast({
        title: "Erro",
        description: response.message || "Erro ao enviar arquivo",
        variant: "destructive",
      });
    }
  };

  const handleReplace = async () => {
    if (!selectedFile || !replaceFileObj) return;

    setReplaceLoading(true);
    const response = await updateFile(selectedFile.id, replaceFileObj);
    setReplaceLoading(false);

    if (response.success) {
      addToast({
        title: "Arquivo atualizado",
        description: `Nova versão: ${response.data?.version}`,
        variant: "success",
      });
      setReplaceModalOpen(false);
      setReplaceFileObj(null);
      setSelectedFile(null);
      fetchFiles();
    } else {
      addToast({
        title: "Erro",
        description: response.message || "Erro ao atualizar arquivo",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (file: StoredFileItem) => {
    const confirmed = window.confirm(`Tem certeza que deseja excluir "${file.name}"?`);
    if (!confirmed) return;

    setDeleteLoading(file.id);
    const response = await deleteFile(file.id);
    setDeleteLoading(null);

    if (response.success) {
      addToast({
        title: "Arquivo excluído",
        description: `${file.name} foi removido`,
        variant: "success",
      });
      fetchFiles();
    } else {
      addToast({
        title: "Erro",
        description: response.message || "Erro ao excluir arquivo",
        variant: "destructive",
      });
    }
  };

  const handleDownload = async (file: StoredFileItem) => {
    const link = document.createElement('a');
    link.href = `${process.env.NEXT_PUBLIC_API_BASE_URL || 'https://safetyapi.squareweb.app'}/v1/files/${file.id}/download`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openReplaceModal = (file: StoredFileItem) => {
    setSelectedFile(file);
    setReplaceFileObj(null);
    setReplaceModalOpen(true);
  };

  const renderFileIcon = (ext: string) => {
    return (
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
        ext === 'dll' ? 'bg-blue-500/10' : 'bg-green-500/10'
      }`}>
        <FileIcon className={`h-5 w-5 ${
          ext === 'dll' ? 'text-blue-500' : 'text-green-500'
        }`} />
      </div>
    );
  };

  return (
    <div className="min-h-screen">
      <Header
        title="Arquivos"
        description="Gerencie arquivos DLL e EXE do sistema"
        onMenuClick={toggleSidebar}
      />

      <main className="p-6">
        {/* Search Bar */}
        <Card className="mb-6 animate-slide-down">
          <CardContent className="py-4">
            <form onSubmit={handleSearch} className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Buscar arquivos..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button type="submit" disabled={loading}>
                Buscar
              </Button>
              <Button
                type="button"
                onClick={() => setUploadModalOpen(true)}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">Enviar Arquivo</span>
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Stats Bar */}
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {total} arquivo(s) encontrado(s)
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchFiles}
            disabled={loading}
            className="bg-transparent"
          >
            <Loader2 className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* Files Grid */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, index) => (
              <Card key={index} className="animate-pulse">
                <CardHeader className="pb-3">
                  <div className="h-5 w-2/3 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="h-9 w-full rounded bg-muted" />
                    <div className="grid grid-cols-2 gap-4">
                      <div className="h-8 rounded bg-muted" />
                      <div className="h-8 rounded bg-muted" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : files.length === 0 ? (
          <Card>
            <CardContent className="flex h-64 flex-col items-center justify-center">
              <FileIcon className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">
                Nenhum arquivo encontrado
              </p>
              <Button
                className="mt-4"
                onClick={() => setUploadModalOpen(true)}
              >
                <Upload className="mr-2 h-4 w-4" />
                Enviar Primeiro Arquivo
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {files.map((file, index) => (
              <Card
                key={file.id}
                className="animate-slide-up opacity-0 border-border/80"
                style={{
                  animationDelay: `${index * 40}ms`,
                  animationFillMode: "forwards",
                }}
              >
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex min-w-0 items-center gap-3">
                        {renderFileIcon(file.extension)}
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Nome</p>
                          <CardTitle className="mt-1 truncate text-base font-semibold leading-none">
                            {file.name}
                          </CardTitle>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tipo</p>
                          <p className="mt-1 font-mono text-sm uppercase">{file.extension}</p>
                        </div>
                        <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tamanho</p>
                          <p className="mt-1 font-mono text-sm">{formatBytes(file.size)}</p>
                        </div>
                        <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Versao</p>
                          <p className="mt-1 font-mono text-sm">v{file.version}</p>
                        </div>
                        <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Atualizado</p>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            {new Date(file.updatedAt).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-muted/40 px-2 py-1 leading-none">
                          <Calendar className="h-3.5 w-3.5 shrink-0" />
                          <span>Criado: {new Date(file.createdAt).toLocaleDateString("pt-BR")}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(file)}
                        className="gap-2 bg-transparent"
                      >
                        <Download className="h-4 w-4" />
                        Baixar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openReplaceModal(file)}
                        className="gap-2 bg-transparent"
                      >
                        <Pencil className="h-4 w-4" />
                        Atualizar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(file)}
                        disabled={deleteLoading === file.id}
                        className="gap-2"
                      >
                        {deleteLoading === file.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        Excluir
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="bg-transparent"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <span className="px-4 text-sm text-muted-foreground">
              Pagina {page} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
              className="bg-transparent"
            >
              Proxima
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </main>

      {/* Upload Modal */}
      <Modal isOpen={uploadModalOpen} onClose={() => setUploadModalOpen(false)}>
        <ModalHeader>
          <ModalTitle>Enviar Arquivo</ModalTitle>
          <ModalDescription>
            Envie um arquivo DLL ou EXE para o repositório
          </ModalDescription>
        </ModalHeader>
        
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Nome (opcional)</label>
            <Input
              type="text"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              placeholder="Nome do arquivo"
              className="mt-1.5"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Se vazio, usa o nome do arquivo
            </p>
          </div>

          <div
            className={`relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
              uploadFileObj ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".dll,.exe"
              onChange={handleFileSelect}
              className="hidden"
            />
            {uploadFileObj ? (
              <>
                <FileIcon className="h-8 w-8 text-primary" />
                <p className="mt-2 font-medium">{uploadFileObj.name}</p>
                <p className="text-sm text-muted-foreground">{formatBytes(uploadFileObj.size)}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    setUploadFileObj(null);
                  }}
                >
                  <X className="mr-2 h-4 w-4" />
                  Remover
                </Button>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="mt-2 font-medium">Clique para enviar</p>
                <p className="text-sm text-muted-foreground">Apenas .dll e .exe (max 50MB)</p>
              </>
            )}
          </div>
        </div>

        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => setUploadModalOpen(false)}
            disabled={uploadLoading}
            className="bg-transparent"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleUpload}
            disabled={uploadLoading || !uploadFileObj}
          >
            {uploadLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </span>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Enviar
              </>
            )}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Replace Modal */}
      <Modal isOpen={replaceModalOpen} onClose={() => setReplaceModalOpen(false)}>
        <ModalHeader>
          <ModalTitle>Atualizar Arquivo</ModalTitle>
          <ModalDescription>
            Substitua "{selectedFile?.name}" por uma nova versão
          </ModalDescription>
        </ModalHeader>
        
        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-sm font-medium">Versao atual: v{selectedFile?.version}</p>
            <p className="text-xs text-muted-foreground">
              A versao sera incrementada automaticamente
            </p>
          </div>

          <div
            className={`relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
              replaceFileObj ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
            onClick={() => replaceInputRef.current?.click()}
          >
            <input
              ref={replaceInputRef}
              type="file"
              accept=".dll,.exe"
              onChange={handleReplaceSelect}
              className="hidden"
            />
            {replaceFileObj ? (
              <>
                <FileIcon className="h-8 w-8 text-primary" />
                <p className="mt-2 font-medium">{replaceFileObj.name}</p>
                <p className="text-sm text-muted-foreground">{formatBytes(replaceFileObj.size)}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    setReplaceFileObj(null);
                  }}
                >
                  <X className="mr-2 h-4 w-4" />
                  Remover
                </Button>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="mt-2 font-medium">Clique para enviar nova versao</p>
                <p className="text-sm text-muted-foreground">Apenas .dll e .exe (max 50MB)</p>
              </>
            )}
          </div>
        </div>

        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => setReplaceModalOpen(false)}
            disabled={replaceLoading}
            className="bg-transparent"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleReplace}
            disabled={replaceLoading || !replaceFileObj}
          >
            {replaceLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Atualizando...
              </span>
            ) : (
              <>
                <Pencil className="mr-2 h-4 w-4" />
                Atualizar
              </>
            )}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}