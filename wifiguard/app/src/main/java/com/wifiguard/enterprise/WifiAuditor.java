package com.wifiguard.enterprise;

import android.net.wifi.ScanResult;
import java.util.*;
import java.util.regex.Pattern;

public final class WifiAuditor {

    private WifiAuditor() {}

    public static String ssid(ScanResult r) {
        String s = r.SSID;
        return (s == null || s.trim().isEmpty()) ? "(SSID oculto)" : s;
    }

    public static String security(String caps) {
        String c = caps == null ? "" : caps.toUpperCase(Locale.ROOT);
        if (c.contains("WEP")) return "WEP";
        if (c.contains("SUITE_B_192")) return "WPA3-Enterprise";
        if (c.contains("SAE")) {
            if (c.contains("PSK")) return "WPA2/WPA3 misto";
            return "WPA3-SAE";
        }
        if (c.contains("OWE")) return "OWE (Enhanced Open)";
        if (c.contains("EAP")) {
            if (c.contains("WPA3")) return "WPA3-Enterprise";
            return "WPA2-Enterprise";
        }
        if (c.contains("PSK")) {
            if (c.contains("WPA2") || c.contains("RSN")) {
                if (c.contains("WPA-")) return "WPA/WPA2 misto";
                return "WPA2-PSK";
            }
            return "WPA-PSK";
        }
        return "Aberta";
    }

    public static boolean hasWps(String caps) {
        return caps != null && caps.toUpperCase(Locale.ROOT).contains("WPS");
    }

    public static boolean hasTkip(String caps) {
        return caps != null && caps.toUpperCase(Locale.ROOT).contains("TKIP");
    }

    public static String pmf(String caps) {
        String c = caps == null ? "" : caps.toUpperCase(Locale.ROOT);
        if (c.contains("MFPR")) return "Obrigatório";
        if (c.contains("MFPC")) return "Suportado/opcional";
        return "Não anunciado";
    }

    public static int channel(int frequencyMhz) {
        if (frequencyMhz >= 2412 && frequencyMhz <= 2472) return (frequencyMhz - 2407) / 5;
        if (frequencyMhz == 2484) return 14;
        if (frequencyMhz >= 5000 && frequencyMhz <= 5895) return (frequencyMhz - 5000) / 5;
        if (frequencyMhz >= 5955 && frequencyMhz <= 7115) return (frequencyMhz - 5950) / 5;
        return -1;
    }

    public static String band(int frequencyMhz) {
        if (frequencyMhz < 3000) return "2,4 GHz";
        if (frequencyMhz < 5900) return "5 GHz";
        return "6 GHz";
    }

    public static int score(ScanResult r) {
        String sec = security(r.capabilities);
        int score;
        if (sec.equals("WEP")) score = 5;
        else if (sec.equals("Aberta")) score = 10;
        else if (sec.equals("WPA-PSK")) score = 25;
        else if (sec.equals("WPA/WPA2 misto")) score = 45;
        else if (sec.equals("WPA2-PSK")) score = 75;
        else if (sec.equals("WPA2/WPA3 misto")) score = 82;
        else if (sec.startsWith("WPA2-Enterprise")) score = 84;
        else if (sec.startsWith("WPA3")) score = 95;
        else if (sec.startsWith("OWE")) score = 72;
        else score = 60;
        if (hasWps(r.capabilities)) score -= 18;
        if (hasTkip(r.capabilities)) score -= 18;
        if ("Obrigatório".equals(pmf(r.capabilities))) score += 4;
        return Math.max(0, Math.min(100, score));
    }

    public static String riskLabel(int score) {
        if (score >= 90) return "BAIXO";
        if (score >= 70) return "MODERADO";
        if (score >= 45) return "ALTO";
        return "CRÍTICO";
    }

    public static List<String> findings(ScanResult r, int sameChannelCount, boolean inconsistentTwin) {
        List<String> out = new ArrayList<>();
        String sec = security(r.capabilities);
        if ("Aberta".equals(sec)) out.add("CRÍTICO: rede aberta, sem proteção de senha.");
        if ("WEP".equals(sec)) out.add("CRÍTICO: WEP é criptografia obsoleta e deve ser removida.");
        if ("WPA-PSK".equals(sec)) out.add("CRÍTICO: WPA legado deve ser substituído por WPA2-AES ou WPA3.");
        if ("WPA/WPA2 misto".equals(sec)) out.add("ALTO: modo misto permite compatibilidade com segurança antiga.");
        if (hasTkip(r.capabilities)) out.add("ALTO: TKIP detectado; prefira AES/CCMP.");
        if (hasWps(r.capabilities)) out.add("ALTO: WPS anunciado. Desative WPS se não for indispensável.");
        else out.add("WPS: não anunciado no resultado de scan. Alguns aparelhos Android não expõem essa informação.");
        if ("Não anunciado".equals(pmf(r.capabilities))) out.add("ATENÇÃO: PMF/802.11w não foi anunciado; verifique no roteador.");
        else out.add("PMF/802.11w: " + pmf(r.capabilities) + ".");
        if (sameChannelCount >= 4) out.add("ATENÇÃO: canal congestionado (" + sameChannelCount + " redes observadas).");
        if (inconsistentTwin) out.add("ALTO: mesmo SSID apareceu com segurança diferente. Investigue AP não autorizado/Evil Twin.");
        if (sec.startsWith("WPA3") && "Obrigatório".equals(pmf(r.capabilities))) out.add("POSITIVO: WPA3 com PMF obrigatório é uma configuração forte.");
        if (out.isEmpty()) out.add("Nenhum alerta importante encontrado no scan passivo.");
        return out;
    }

    public static PasswordResult auditPassword(String password, String ssid) {
        if (password == null) password = "";
        int len = password.length();
        int charset = 0;
        if (Pattern.compile("[a-z]").matcher(password).find()) charset += 26;
        if (Pattern.compile("[A-Z]").matcher(password).find()) charset += 26;
        if (Pattern.compile("[0-9]").matcher(password).find()) charset += 10;
        if (Pattern.compile("[^A-Za-z0-9]").matcher(password).find()) charset += 32;
        if (charset == 0) charset = 1;
        double bits = len * (Math.log(charset) / Math.log(2.0));
        String p = password.toLowerCase(Locale.ROOT);
        String s = ssid == null ? "" : ssid.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
        Set<String> common = new HashSet<>(Arrays.asList("12345678", "123456789", "password", "senha1234", "qwerty123", "admin123", "internet", "wifi12345", "1234567890", "abcdef123"));
        List<String> issues = new ArrayList<>();
        if (len < 12) issues.add("Senha curta; use pelo menos 16 caracteres para Wi-Fi corporativo.");
        if (common.contains(p)) issues.add("Senha extremamente comum.");
        if (!s.isEmpty() && p.replaceAll("[^a-z0-9]", "").contains(s)) issues.add("A senha contém o nome da rede.");
        if (password.matches("[0-9]+")) issues.add("Senha composta apenas por números.");
        if (password.matches("[A-Za-z]+")) issues.add("Senha composta apenas por letras.");
        int rating;
        if (common.contains(p) || len < 8) rating = 5;
        else if (bits < 45) rating = 35;
        else if (bits < 65) rating = 60;
        else if (bits < 85) rating = 80;
        else rating = 95;
        if (issues.isEmpty()) issues.add("Nenhum padrão fraco óbvio encontrado.");
        return new PasswordResult(bits, rating, issues);
    }

    public static class PasswordResult {
        public final double entropyBits;
        public final int rating;
        public final List<String> issues;
        PasswordResult(double entropyBits, int rating, List<String> issues) {
            this.entropyBits = entropyBits;
            this.rating = rating;
            this.issues = issues;
        }
    }
}
