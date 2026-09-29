import { Share2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type ShareKind = "trip" | "fueling" | "advance" | "expense";

export function ShareToChatGPT({
  kind,
  className = "",
}: {
  kind: ShareKind;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState("");

  async function shareFiles(files?: FileList | null) {
    const selected = Array.from(files || []).slice(0, 20);
    if (!selected.length) return;

    try {
      setStatus("");
      const nav = navigator as Navigator & {
        share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
        canShare?: (data: { files?: File[] }) => boolean;
      };

      if (typeof nav.share !== "function") {
        setStatus("Este navegador não oferece compartilhamento de arquivos. Abra pelo Android/Chrome ou pelo APK.");
        return;
      }
      if (typeof nav.canShare === "function" && !nav.canShare({ files: selected })) {
        setStatus("O Android não permitiu compartilhar este tipo de arquivo. Tente uma foto JPG/PNG ou PDF.");
        return;
      }

      await nav.share({
        files: selected,
        title: "Trans Salomão",
        text: promptFor(kind),
      });
      setStatus("Compartilhamento aberto. Escolha o ChatGPT na lista de aplicativos.");
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name !== "AbortError") {
        setStatus("Não foi possível abrir o compartilhamento. Tente novamente pelo Android.");
      }
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={className}>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => {
          setStatus("");
          inputRef.current?.click();
        }}
      >
        <Share2 className="size-4" /> Enviar ao ChatGPT
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
        onChange={(event) => void shareFiles(event.target.files)}
      />
      {status ? <p className="mt-1 max-w-sm text-[11px] text-muted">{status}</p> : null}
    </div>
  );
}

function promptFor(kind: ShareKind) {
  if (kind === "fueling") {
    return "Trans Salomão: analise este abastecimento. Extraia data e hora impressas no documento, posto, litros exatos, preço por litro, desconto, total final pago, placa, combustível, documento/bomba e odômetro quando visíveis. Não use a data de envio da foto.";
  }
  if (kind === "expense") {
    return "Trans Salomão: analise este comprovante de despesa. Extraia valor, data e hora do documento, favorecido/estabelecimento, descrição e outros dados úteis para o lançamento.";
  }
  if (kind === "advance") {
    return "Trans Salomão: analise este comprovante de adiantamento. Extraia valor, data e hora do documento, recebedor e dados úteis para identificar o motorista.";
  }
  return "Trans Salomão: analise este ticket de viagem. Extraia número do ticket, data e hora impressas, peso líquido exato, placas, origem, destino, empresa/contratante e demais dados visíveis. Não use a data de envio da foto.";
}
