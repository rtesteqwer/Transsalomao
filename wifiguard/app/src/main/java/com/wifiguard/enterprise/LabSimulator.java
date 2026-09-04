package com.wifiguard.enterprise;

import java.text.DecimalFormat;

public final class LabSimulator {
    private LabSimulator() {}

    public static String passwordResistanceModel(int length, int charsetSize) {
        if (length < 1) length = 1;
        if (charsetSize < 2) charsetSize = 2;
        double space = Math.pow(charsetSize, length);
        double[] rates = {1e3, 1e6, 1e9};
        String[] labels = {"1 mil", "1 milhão", "1 bilhão"};
        DecimalFormat df = new DecimalFormat("0.###E0");
        StringBuilder sb = new StringBuilder();
        sb.append("MODELO DE RESISTÊNCIA DA SENHA\n\n");
        sb.append("Comprimento: ").append(length).append("\n");
        sb.append("Alfabeto: ").append(charsetSize).append(" símbolos\n");
        sb.append("Espaço total: ").append(df.format(space)).append(" combinações\n\n");
        sb.append("Tempo médio teórico para percorrer metade do espaço:\n");
        for (int i=0;i<rates.length;i++) {
            double seconds=(space/2.0)/rates[i];
            sb.append("• ").append(labels[i]).append(" tentativas/s: ").append(humanTime(seconds)).append("\n");
        }
        sb.append("\nSimulação matemática local; nenhuma tentativa é enviada a uma rede.");
        return sb.toString();
    }

    public static String managementFrameAssessment(boolean pmfRequired, boolean pmfSupported) {
        if (pmfRequired) return "PMF obrigatório anunciado: proteção forte contra quadros de gerenciamento não autenticados.";
        if (pmfSupported) return "PMF suportado, mas opcional: considere torná-lo obrigatório se todos os clientes forem compatíveis.";
        return "PMF não anunciado: revise a configuração do roteador para proteção de quadros de gerenciamento.";
    }

    private static String humanTime(double seconds) {
        if (Double.isInfinite(seconds) || seconds > 1e25) return "> 3×10^17 anos";
        if (seconds < 1) return String.format("%.3f s", seconds);
        if (seconds < 60) return String.format("%.1f s", seconds);
        double minutes=seconds/60;
        if (minutes < 60) return String.format("%.1f min", minutes);
        double hours=minutes/60;
        if (hours < 24) return String.format("%.1f h", hours);
        double days=hours/24;
        if (days < 365) return String.format("%.1f dias", days);
        return String.format("%.2e anos", days/365.25);
    }
}
