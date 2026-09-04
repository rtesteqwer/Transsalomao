package com.wifiguard.enterprise;

import android.net.wifi.ScanResult;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class WifiSecurityAnalyzer {
    private WifiSecurityAnalyzer() {}
    public static final class AuditResult {
        public final String security; public final int score; public final boolean wps; public final boolean pmfCapable; public final boolean pmfRequired; public final List<String> findings;
        AuditResult(String security,int score,boolean wps,boolean pmfCapable,boolean pmfRequired,List<String> findings){this.security=security;this.score=Math.max(0,Math.min(100,score));this.wps=wps;this.pmfCapable=pmfCapable;this.pmfRequired=pmfRequired;this.findings=findings;}
    }
    public static AuditResult analyze(ScanResult r){
        String caps=r.capabilities==null?"":r.capabilities.toUpperCase(Locale.US); List<String> findings=new ArrayList<>(); int score=100; String sec;
        if(caps.contains("WEP")){sec="WEP";score=5;findings.add("CRÍTICO: WEP é obsoleto e não deve ser usado.");}
        else if(caps.contains("SAE")){sec=caps.contains("PSK")?"WPA2/WPA3 transicional":"WPA3-SAE";if(caps.contains("PSK")){score-=15;findings.add("Atenção: modo transicional mantém compatibilidade WPA2.");}else findings.add("Bom: WPA3-SAE anunciado.");}
        else if(caps.contains("OWE")){sec="OWE (Enhanced Open)";score=80;findings.add("OWE cifra o enlace, mas não autentica o ponto de acesso.");}
        else if(caps.contains("WPA2")&&caps.contains("PSK")){sec="WPA2-PSK";score=78;findings.add("WPA2-PSK: use senha longa, aleatória e exclusiva.");}
        else if(caps.contains("WPA2")&&(caps.contains("EAP")||caps.contains("802.1X"))){sec="WPA2-Enterprise";score=85;findings.add("Enterprise detectado: valide certificados e configuração 802.1X.");}
        else if(caps.contains("WPA")&&caps.contains("PSK")){sec="WPA legado";score=30;findings.add("ALTO: WPA legado deve ser substituído por WPA2-AES/WPA3.");}
        else if(caps.contains("EAP")||caps.contains("802.1X")){sec="Enterprise";score=75;findings.add("Rede Enterprise: revisar política EAP e certificados.");}
        else{sec="Aberta";score=10;findings.add("CRÍTICO: rede sem autenticação/cifra de acesso.");}
        if(caps.contains("TKIP")){score-=25;findings.add("ALTO: TKIP detectado; prefira CCMP/AES.");}
        boolean wps=caps.contains("WPS"); if(wps){score-=15;findings.add("ALTO: WPS anunciado; desative se não for necessário.");}
        boolean pmfRequired=caps.contains("MFPR"); boolean pmfCapable=pmfRequired||caps.contains("MFPC");
        if(pmfRequired)findings.add("Bom: PMF/802.11w aparenta ser obrigatório."); else if(pmfCapable){score-=4;findings.add("PMF disponível, mas não aparenta ser obrigatório.");} else {score-=8;findings.add("PMF não foi identificado nas capabilities fornecidas pelo aparelho.");}
        if(r.level<-80)findings.add("Sinal fraco: abaixo de -80 dBm."); return new AuditResult(sec,score,wps,pmfCapable,pmfRequired,findings);
    }
    public static String riskLabel(int score){if(score>=85)return "BAIXO";if(score>=65)return "MODERADO";if(score>=40)return "ALTO";return "CRÍTICO";}
    public static String band(int mhz){if(mhz>=5925)return "6 GHz";if(mhz>=4900)return "5 GHz";return "2.4 GHz";}
    public static int channel(int freq){if(freq==2484)return 14;if(freq>=2412&&freq<=2472)return(freq-2407)/5;if(freq>=5000&&freq<=5900)return(freq-5000)/5;if(freq>=5955&&freq<=7115)return(freq-5950)/5;return-1;}
}
