import { Download, Printer, Share2, Copy } from "lucide-react";
import Modal from "./Modal";

// Shows a marketing person's personal portal QR code + link. They scan/visit it, enter
// their password, and see their own stats only — same idea as a doctor's referral QR, but
// leads to a password-gated read-only report instead of an open referral form.
export default function MarketingPersonQrModal({ name, portalUrl, qrDataUrl, onClose }) {
  function handleDownload() {
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `${name}-portal-qr.png`;
    a.click();
  }

  function handlePrint() {
    const win = window.open("", "_blank", "width=420,height=560");
    if (!win) return;
    win.document.write(`
      <html>
        <head><title>${name} — Marketing Portal QR</title></head>
        <body style="font-family: -apple-system, sans-serif; text-align:center; padding:32px;">
          <h2 style="margin-bottom:4px;">${name}</h2>
          <p style="color:#667085; margin-top:0;">Marketing portal access</p>
          <img src="${qrDataUrl}" style="width:260px;height:260px;" />
          <p style="font-size:12px;color:#667085;word-break:break-all;">${portalUrl}</p>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    win.document.close();
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `${name}'s marketing portal`, url: portalUrl });
        return;
      } catch {
        // user cancelled or share failed — fall through to clipboard copy
      }
    }
    await navigator.clipboard.writeText(portalUrl);
    alert("Portal link copied to clipboard.");
  }

  return (
    <Modal title={`${name}'s portal QR`} onClose={onClose} width={380}>
      <div style={{ textAlign: "center" }}>
        <img src={qrDataUrl} alt="QR code" style={{ width: 200, height: 200, borderRadius: 10, border: "1px solid var(--border)" }} />
        <p style={{ fontSize: 12, wordBreak: "break-all", color: "var(--ink-soft)", margin: "12px 0" }}>{portalUrl}</p>
        <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          They'll be asked for their password the first time they open this link.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 16 }}>
          <button onClick={handleDownload}><Download size={15} />Download</button>
          <button className="secondary" onClick={handlePrint}><Printer size={15} />Print</button>
          <button className="secondary" onClick={handleShare}><Share2 size={15} />Share</button>
          <button className="secondary" onClick={() => { navigator.clipboard.writeText(portalUrl); alert("Link copied."); }}>
            <Copy size={15} />Copy link
          </button>
        </div>
      </div>
    </Modal>
  );
}
