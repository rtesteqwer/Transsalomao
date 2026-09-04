package com.wifiguard.enterprise;

import java.io.*;

public final class PcapAnalyzer {
    private PcapAnalyzer() {}

    public static Result analyze(InputStream input, long maxBytes) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        long total = 0;
        int n;
        while ((n = input.read(buffer)) != -1) {
            total += n;
            if (total > maxBytes) throw new IOException("Arquivo acima do limite permitido.");
            out.write(buffer, 0, n);
        }
        byte[] data = out.toByteArray();
        boolean pcap = hasPcapMagic(data);
        int eapol = countPattern(data, new byte[]{(byte)0x88,(byte)0x8e});
        int llc = countPattern(data, new byte[]{(byte)0xaa,(byte)0xaa,(byte)0x03,(byte)0x00,(byte)0x00,(byte)0x00,(byte)0x88,(byte)0x8e});
        int evidence = Math.max(eapol, llc);
        String status = evidence == 0 ? "Nenhuma assinatura EAPOL encontrada." :
                evidence < 3 ? "EAPOL encontrado; evidência parcial." :
                "Múltiplos quadros EAPOL encontrados; forte indício de material de handshake no arquivo.";
        return new Result(data.length, pcap, evidence, status);
    }

    private static boolean hasPcapMagic(byte[] d) {
        if (d.length < 4) return false;
        int a=d[0]&255,b=d[1]&255,c=d[2]&255,e=d[3]&255;
        return (a==0xd4&&b==0xc3&&c==0xb2&&e==0xa1) ||
               (a==0xa1&&b==0xb2&&c==0xc3&&e==0xd4) ||
               (a==0x0a&&b==0x0d&&c==0x0d&&e==0x0a);
    }

    private static int countPattern(byte[] data, byte[] pattern) {
        int count = 0;
        outer: for (int i=0;i<=data.length-pattern.length;i++) {
            for (int j=0;j<pattern.length;j++) if (data[i+j]!=pattern[j]) continue outer;
            count++;
        }
        return count;
    }

    public static class Result {
        public final int bytes;
        public final boolean pcapLike;
        public final int eapolSignatures;
        public final String status;
        Result(int bytes, boolean pcapLike, int eapolSignatures, String status) {
            this.bytes=bytes; this.pcapLike=pcapLike; this.eapolSignatures=eapolSignatures; this.status=status;
        }
        public String describe() {
            return "Arquivo: "+bytes+" bytes\nFormato PCAP/PCAPNG aparente: "+(pcapLike?"sim":"não confirmado")+
                    "\nAssinaturas EAPOL: "+eapolSignatures+"\n\n"+status+
                    "\n\nEste módulo apenas confirma evidências no arquivo; não recupera senhas.";
        }
    }
}
