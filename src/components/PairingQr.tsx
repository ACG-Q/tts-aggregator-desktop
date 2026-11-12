import { QRCodeSVG } from 'qrcode.react';

export function PairingQr({ value, size = 160 }: { value: string; size?: number }) {
  return (
    <div className="rounded-[10px] bg-white p-2.5">
      <QRCodeSVG value={value} size={size} level="M" bgColor="#ffffff" fgColor="#1a1e18" />
    </div>
  );
}
