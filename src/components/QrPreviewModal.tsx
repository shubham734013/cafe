import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface QrPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle: string;
  value: string;
  downloadFileName?: string;
  badgeText?: string;
  onDownloadPdf?: () => void | Promise<void>;
  pdfGenerating?: boolean;
}

export const QrPreviewModal: React.FC<QrPreviewModalProps> = ({
  open,
  onOpenChange,
  title,
  subtitle,
  value,
  downloadFileName = 'cafeos-qr.png',
  badgeText,
  onDownloadPdf,
  pdfGenerating = false,
}) => {
  const [dataUrl, setDataUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !value) return;
    let cancelled = false;
    setError(null);
    QRCode.toDataURL(value, {
      width: 280,
      margin: 2,
      color: {
        dark: '#17120f',
        light: '#fffaf3',
      },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to generate QR code');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, value]);

  const handleDownload = () => {
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = downloadFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-container border border-outline-variant/30 text-on-surface sm:max-w-sm rounded-2xl p-5">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-primary flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">qr_code_2</span>
            <span>{title}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-on-surface-variant">
            {subtitle}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2">
          {badgeText && (
            <span className="px-2.5 py-0.5 rounded-full bg-primary-container/20 text-primary text-[11px] font-bold">
              {badgeText}
            </span>
          )}

          {error ? (
            <p className="text-xs text-error py-8">{error}</p>
          ) : dataUrl ? (
            <div className="p-3 rounded-2xl bg-[#fffaf3] shadow-xl">
              <img src={dataUrl} alt={title} className="w-52 h-52 block rounded-lg" />
            </div>
          ) : (
            <div className="w-56 h-56 rounded-2xl bg-surface-container-low animate-pulse" />
          )}

          <p className="text-[11px] text-outline text-center break-all px-2 font-mono max-h-12 overflow-hidden">
            {value}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex-1 min-w-[84px] py-2.5 rounded-xl bg-surface-container-high text-on-surface text-xs font-semibold cursor-pointer hover:bg-surface-bright"
          >
            Close
          </button>
          <button
            type="button"
            disabled={!dataUrl}
            onClick={handleDownload}
            className="flex-1 min-w-[96px] py-2.5 rounded-xl bg-surface-container-highest text-primary text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 hover:bg-surface-bright"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            <span>Save PNG</span>
          </button>
          {onDownloadPdf && (
            <button
              type="button"
              disabled={!dataUrl || pdfGenerating}
              onClick={() => void onDownloadPdf()}
              className="flex-1 min-w-[110px] py-2.5 rounded-xl bg-primary-container text-on-primary text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
              <span>{pdfGenerating ? 'Generating...' : 'Print QR PDF'}</span>
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
