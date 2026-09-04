package com.wifiguard.enterprise;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.wifi.*;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.widget.*;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.*;

public class MainActivity extends Activity {

    private static final int REQ_PERMS = 100;
    private static final int REQ_PCAP = 101;
    private static final int REQ_EXPORT = 102;

    private WifiManager wifiManager;
    private LinearLayout listContainer;
    private TextView statusText;
    private final List<ScanResult> lastResults = new ArrayList<>();
    private String lastReport = "Nenhuma auditoria executada.";

    private final BroadcastReceiver wifiReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (WifiManager.SCAN_RESULTS_AVAILABLE_ACTION.equals(intent.getAction())) loadScanResults();
        }
    };

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        wifiManager = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        buildUi();
        registerReceiver(wifiReceiver, new IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION));
        ensurePermissions();
    }

    @Override protected void onDestroy() {
        super.onDestroy();
        try { unregisterReceiver(wifiReceiver); } catch (Exception ignored) {}
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(18), dp(18), dp(18), dp(24));
        scroll.addView(root);

        TextView title = new TextView(this);
        title.setText("WiFi Guard Enterprise");
        title.setTextSize(28);
        root.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText("Auditoria defensiva de redes Wi‑Fi");
        subtitle.setTextSize(16);
        subtitle.setPadding(0, 0, 0, dp(16));
        root.addView(subtitle);

        statusText = new TextView(this);
        statusText.setText("Pronto para verificar redes próximas.");
        statusText.setPadding(0, 0, 0, dp(12));
        root.addView(statusText);

        root.addView(button("ESCANEAR WI‑FI", v -> scanWifi()));
        root.addView(button("ANALISAR PCAP / EAPOL", v -> choosePcap()));
        root.addView(button("LABORATÓRIO DE RESISTÊNCIA", v -> openLab()));
        root.addView(button("EXPORTAR RELATÓRIO", v -> exportReport()));

        TextView legend = new TextView(this);
        legend.setText("\nRedes encontradas");
        legend.setTextSize(20);
        root.addView(legend);

        listContainer = new LinearLayout(this);
        listContainer.setOrientation(LinearLayout.VERTICAL);
        root.addView(listContainer);

        TextView notice = new TextView(this);
        notice.setText("\nO Android comum não oferece monitor mode/injeção de quadros em todos os aparelhos. " +
                "O app faz scan e auditoria reais, analisa PCAPs offline e simula resistência de senha sem atacar redes.");
        notice.setTextSize(12);
        root.addView(notice);
        setContentView(scroll);
    }

    private Button button(String text, View.OnClickListener listener) {
        Button b = new Button(this);
        b.setText(text);
        b.setOnClickListener(listener);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        p.setMargins(0, dp(4), 0, dp(4));
        b.setLayoutParams(p);
        return b;
    }

    private void ensurePermissions() {
        List<String> needed = new ArrayList<>();
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED)
            needed.add(Manifest.permission.ACCESS_FINE_LOCATION);
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.NEARBY_WIFI_DEVICES) != PackageManager.PERMISSION_GRANTED)
            needed.add(Manifest.permission.NEARBY_WIFI_DEVICES);
        if (!needed.isEmpty()) requestPermissions(needed.toArray(new String[0]), REQ_PERMS);
    }

    private boolean hasPermissions() {
        boolean fine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean nearby = Build.VERSION.SDK_INT < 33 ||
                checkSelfPermission(Manifest.permission.NEARBY_WIFI_DEVICES) == PackageManager.PERMISSION_GRANTED;
        return fine && nearby;
    }

    private void scanWifi() {
        if (!hasPermissions()) {
            ensurePermissions();
            statusText.setText("Conceda as permissões de Wi‑Fi/localização e tente novamente.");
            return;
        }
        if (!wifiManager.isWifiEnabled()) {
            statusText.setText("Ative o Wi‑Fi do aparelho e tente novamente.");
            if (Build.VERSION.SDK_INT >= 29) startActivity(new Intent(Settings.Panel.ACTION_WIFI));
            return;
        }
        boolean started = wifiManager.startScan();
        statusText.setText(started ? "Varredura solicitada..." :
                "O Android limitou uma nova varredura. Mostrando resultados disponíveis.");
        if (!started) loadScanResults();
    }

    private void loadScanResults() {
        if (!hasPermissions()) return;
        List<ScanResult> scans;
        try { scans = wifiManager.getScanResults(); }
        catch (SecurityException e) {
            statusText.setText("Permissão insuficiente para ler o scan.");
            return;
        }
        lastResults.clear();
        if (scans != null) lastResults.addAll(scans);
        lastResults.sort((a, b) -> Integer.compare(b.level, a.level));
        renderNetworks();
    }

    private void renderNetworks() {
        listContainer.removeAllViews();
        if (lastResults.isEmpty()) {
            statusText.setText("Nenhuma rede retornada. Verifique Wi‑Fi, localização e permissões.");
            return;
        }

        Map<Integer,Integer> channelCounts = new HashMap<>();
        Map<String,Set<String>> ssidSecurities = new HashMap<>();
        for (ScanResult r : lastResults) {
            int ch = WifiAuditor.channel(r.frequency);
            channelCounts.put(ch, channelCounts.getOrDefault(ch, 0) + 1);
            String key = WifiAuditor.ssid(r);
            ssidSecurities.computeIfAbsent(key, k -> new HashSet<>()).add(WifiAuditor.security(r.capabilities));
        }

        StringBuilder report = new StringBuilder();
        report.append("WIFI GUARD ENTERPRISE\n")
                .append(new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(new Date()))
                .append("\nRedes observadas: ").append(lastResults.size()).append("\n\n");

        for (ScanResult r : lastResults) {
            String name = WifiAuditor.ssid(r);
            int ch = WifiAuditor.channel(r.frequency);
            int score = WifiAuditor.score(r);
            int congest = channelCounts.getOrDefault(ch, 1);
            boolean twin = ssidSecurities.getOrDefault(name, Collections.emptySet()).size() > 1;

            TextView card = new TextView(this);
            card.setText(name + "\n" + WifiAuditor.security(r.capabilities) + "  •  " +
                    WifiAuditor.band(r.frequency) + " / canal " + ch + "\n" +
                    r.level + " dBm  •  Segurança " + score + "/100 (" + WifiAuditor.riskLabel(score) + ")");
            card.setTextSize(16);
            card.setPadding(dp(12), dp(12), dp(12), dp(12));
            card.setBackgroundResource(android.R.drawable.dialog_holo_light_frame);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.setMargins(0, dp(5), 0, dp(5));
            card.setLayoutParams(lp);
            card.setClickable(true);
            card.setOnClickListener(v -> showNetworkDetails(r, congest, twin));
            listContainer.addView(card);

            report.append(name).append("\nBSSID: ").append(r.BSSID)
                    .append("\nSegurança: ").append(WifiAuditor.security(r.capabilities))
                    .append("\nScore: ").append(score).append("/100")
                    .append("\nSinal: ").append(r.level).append(" dBm")
                    .append("\nFrequência: ").append(r.frequency).append(" MHz / canal ").append(ch)
                    .append("\nWPS anunciado: ").append(WifiAuditor.hasWps(r.capabilities) ? "sim" : "não/indeterminado")
                    .append("\nPMF: ").append(WifiAuditor.pmf(r.capabilities)).append("\n");
            for (String f : WifiAuditor.findings(r, congest, twin)) report.append("- ").append(f).append("\n");
            report.append("\n");
        }
        lastReport = report.toString();
        statusText.setText(lastResults.size() + " redes analisadas. Toque em uma rede para ver os testes.");
    }

    private void showNetworkDetails(ScanResult r, int sameChannelCount, boolean twin) {
        int score = WifiAuditor.score(r);
        boolean pmfRequired = "Obrigatório".equals(WifiAuditor.pmf(r.capabilities));
        boolean pmfSupported = "Suportado/opcional".equals(WifiAuditor.pmf(r.capabilities));
        StringBuilder text = new StringBuilder();
        text.append("SSID: ").append(WifiAuditor.ssid(r)).append("\n")
                .append("BSSID: ").append(r.BSSID).append("\n")
                .append("Segurança: ").append(WifiAuditor.security(r.capabilities)).append("\n")
                .append("Score: ").append(score).append("/100 (").append(WifiAuditor.riskLabel(score)).append(")\n")
                .append("Sinal: ").append(r.level).append(" dBm\n")
                .append("Frequência: ").append(r.frequency).append(" MHz\n")
                .append("Canal: ").append(WifiAuditor.channel(r.frequency)).append("\n")
                .append("WPS: ").append(WifiAuditor.hasWps(r.capabilities) ? "anunciado" : "não anunciado/indeterminado").append("\n")
                .append("PMF: ").append(WifiAuditor.pmf(r.capabilities)).append("\n\nTESTES E ACHADOS\n");
        for (String f : WifiAuditor.findings(r, sameChannelCount, twin)) text.append("• ").append(f).append("\n");
        text.append("\n").append(LabSimulator.managementFrameAssessment(pmfRequired, pmfSupported));

        new AlertDialog.Builder(this)
                .setTitle(WifiAuditor.ssid(r))
                .setMessage(text.toString())
                .setPositiveButton("TESTAR SENHA LOCAL", (d, w) -> passwordDialog(r))
                .setNegativeButton("FECHAR", null)
                .show();
    }

    private void passwordDialog(ScanResult r) {
        final EditText input = new EditText(this);
        input.setHint("Digite a senha da sua própria rede");
        input.setSingleLine(true);
        new AlertDialog.Builder(this)
                .setTitle("Auditoria local de senha")
                .setMessage("A senha é avaliada localmente e não é enviada para uma rede.")
                .setView(input)
                .setPositiveButton("ANALISAR", (d, w) -> {
                    WifiAuditor.PasswordResult pr = WifiAuditor.auditPassword(input.getText().toString(), WifiAuditor.ssid(r));
                    StringBuilder s = new StringBuilder();
                    s.append("Nota: ").append(pr.rating).append("/100\nEntropia aproximada: ")
                            .append(String.format(Locale.getDefault(), "%.1f", pr.entropyBits)).append(" bits\n\n");
                    for (String issue : pr.issues) s.append("• ").append(issue).append("\n");
                    new AlertDialog.Builder(this).setTitle("Resultado da senha").setMessage(s.toString())
                            .setPositiveButton("OK", null).show();
                })
                .setNegativeButton("CANCELAR", null)
                .show();
    }

    private void choosePcap() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        startActivityForResult(i, REQ_PCAP);
    }

    private void openLab() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(20), dp(8), dp(20), 0);
        EditText len = new EditText(this);
        len.setHint("Comprimento da senha (ex.: 16)");
        len.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        box.addView(len);
        EditText chars = new EditText(this);
        chars.setHint("Tamanho do alfabeto (ex.: 94)");
        chars.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        box.addView(chars);
        new AlertDialog.Builder(this)
                .setTitle("Laboratório de resistência")
                .setMessage("Modelo matemático local para avaliar espaço de senha.")
                .setView(box)
                .setPositiveButton("SIMULAR", (d, w) -> {
                    int l = parseInt(len.getText().toString(), 16);
                    int c = parseInt(chars.getText().toString(), 94);
                    new AlertDialog.Builder(this).setTitle("Resultado")
                            .setMessage(LabSimulator.passwordResistanceModel(l, c))
                            .setPositiveButton("OK", null).show();
                })
                .setNegativeButton("CANCELAR", null).show();
    }

    private void exportReport() {
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("text/plain");
        i.putExtra(Intent.EXTRA_TITLE, "wifi-guard-relatorio.txt");
        startActivityForResult(i, REQ_EXPORT);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null) return;
        if (requestCode == REQ_PCAP) {
            try (InputStream in = getContentResolver().openInputStream(data.getData())) {
                PcapAnalyzer.Result r = PcapAnalyzer.analyze(in, 25L * 1024 * 1024);
                new AlertDialog.Builder(this).setTitle("Análise PCAP / EAPOL")
                        .setMessage(r.describe()).setPositiveButton("OK", null).show();
            } catch (Exception e) { showError("Falha ao analisar arquivo: " + e.getMessage()); }
        } else if (requestCode == REQ_EXPORT) {
            try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                if (out != null) out.write(lastReport.getBytes(StandardCharsets.UTF_8));
                statusText.setText("Relatório exportado.");
            } catch (Exception e) { showError("Falha ao exportar relatório: " + e.getMessage()); }
        }
    }

    private void showError(String msg) {
        new AlertDialog.Builder(this).setTitle("Erro").setMessage(msg).setPositiveButton("OK", null).show();
    }

    private int parseInt(String s, int fallback) {
        try { return Integer.parseInt(s); } catch (Exception e) { return fallback; }
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density);
    }
}
