package com.transsalomao.fretes;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.pdf.PdfDocument;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final int REQ_BACKUP = 7001;
    private static final int REQ_PDF = 7002;
    private static final int REQ_RESTORE = 7003;
    private static final int NAVY = Color.rgb(15, 36, 67);
    private static final int GOLD = Color.rgb(218, 165, 32);
    private static final int BG = Color.rgb(245, 247, 250);
    private static final int TEXT = Color.rgb(32, 38, 49);

    private DbHelper db;
    private LinearLayout root;
    private boolean onHome = true;
    private String currentOperator = "";
    private String pendingReportText = "";
    private String pendingReportPeriod = "Completo";
    private final Locale ptBR = new Locale("pt", "BR");

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(NAVY);
        db = new DbHelper(this);
        showHome();
    }

    private ScrollView newScreen(String title, String subtitle) {
        onHome = false;
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(BG);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(18), dp(18), dp(18), dp(28));
        scroll.addView(root, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        if (title != null) addHeader(title, subtitle);
        setContentView(scroll);
        return scroll;
    }

    private void addHeader(String title, String subtitle) {
        TextView t = text(title, 26, NAVY, true);
        t.setGravity(Gravity.CENTER_HORIZONTAL);
        root.addView(t, matchWrap(0));
        if (subtitle != null && !subtitle.isEmpty()) {
            TextView s = text(subtitle, 14, Color.DKGRAY, false);
            s.setGravity(Gravity.CENTER_HORIZONTAL);
            s.setPadding(0, dp(4), 0, dp(12));
            root.addView(s, matchWrap(0));
        }
    }

    private void addBackButton() {
        Button b = button("← Voltar ao início", NAVY);
        b.setOnClickListener(v -> showHome());
        root.addView(b, matchWrap(dp(10)));
    }

    private TextView text(String value, float sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(value);
        t.setTextSize(sp);
        t.setTextColor(color);
        t.setTypeface(Typeface.DEFAULT, bold ? Typeface.BOLD : Typeface.NORMAL);
        t.setLineSpacing(0, 1.12f);
        return t;
    }

    private Button button(String value, int color) {
        Button b = new Button(this);
        b.setText(value);
        b.setTextColor(Color.WHITE);
        b.setTextSize(16);
        b.setAllCaps(false);
        b.setBackgroundColor(color);
        b.setPadding(dp(12), dp(12), dp(12), dp(12));
        return b;
    }

    private LinearLayout.LayoutParams matchWrap(int top) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        p.topMargin = top;
        return p;
    }

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density + 0.5f);
    }

    private EditText field(String hint, int inputType) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setTextSize(16);
        e.setTextColor(TEXT);
        e.setHintTextColor(Color.GRAY);
        e.setBackgroundColor(Color.WHITE);
        e.setPadding(dp(12), dp(11), dp(12), dp(11));
        e.setInputType(inputType);
        root.addView(e, matchWrap(dp(8)));
        return e;
    }

    private Spinner spinner(List<String> values) {
        Spinner s = new Spinner(this);
        ArrayAdapter<String> a = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, values);
        a.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        s.setAdapter(a);
        s.setBackgroundColor(Color.WHITE);
        root.addView(s, matchWrap(dp(8)));
        return s;
    }

    private void selectSpinner(Spinner spinner, String value) {
        if (value == null) return;
        for (int i = 0; i < spinner.getCount(); i++) {
            if (value.equals(String.valueOf(spinner.getItemAtPosition(i)))) {
                spinner.setSelection(i);
                return;
            }
        }
    }

    private void ensureOption(List<String> values, String selected) {
        if (selected == null || selected.trim().isEmpty()) return;
        if (!values.contains(selected)) values.add(0, selected);
    }

    private void section(String title) {
        TextView t = text(title, 19, NAVY, true);
        t.setPadding(0, dp(18), 0, dp(4));
        root.addView(t, matchWrap(0));
    }

    private double num(EditText e) {
        try {
            String s = e.getText().toString().trim();
            if (s.isEmpty()) return 0;
            if (s.contains(",")) s = s.replace(".", "").replace(',', '.');
            return Double.parseDouble(s);
        } catch (Exception ex) {
            return 0;
        }
    }

    private String str(EditText e) {
        return e.getText().toString().trim();
    }

    private String money(double v) {
        return NumberFormat.getCurrencyInstance(ptBR).format(v);
    }

    private String dec(double v) {
        return String.format(ptBR, "%.2f", v);
    }

    private String editNum(double v) {
        return String.format(Locale.US, "%.2f", v);
    }

    private void addKpi(String label, String value) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(14), dp(12), dp(14), dp(12));
        card.setBackgroundColor(Color.WHITE);
        TextView l = text(label, 13, Color.DKGRAY, false);
        TextView v = text(value, 22, NAVY, true);
        card.addView(l);
        card.addView(v);
        root.addView(card, matchWrap(dp(7)));
    }

    private void showHome() {
        ScrollView scroll = newScreen(null, null);
        onHome = true;
        addHeader("TRANS SALOMÃO", "Movendo caminhos, entregando confiança");

        double[] s = db.summary("Completo");
        section("Resumo geral");
        addKpi("Viagens", String.valueOf((int) s[0]));
        addKpi("Peso líquido transportado", dec(s[1]) + " t");
        addKpi("KM rodados", dec(s[2]) + " km");
        addKpi("Faturamento", money(s[3]));
        addKpi("Resultado após comissão", money(s[8]));

        section("Viagens");
        Button trip = button("＋ Registrar nova viagem", GOLD);
        trip.setTextColor(NAVY);
        trip.setOnClickListener(v -> showTripForm());
        root.addView(trip, matchWrap(dp(8)));

        Button editTrips = button("✎ Viagens lançadas / Editar", NAVY);
        editTrips.setOnClickListener(v -> showTrips());
        root.addView(editTrips, matchWrap(dp(8)));

        section("Cadastros e gestão");
        Button drivers = button("Cadastro de motoristas", NAVY);
        drivers.setOnClickListener(v -> showDrivers());
        root.addView(drivers, matchWrap(dp(8)));

        Button sets = button("Conjuntos de carreta", NAVY);
        sets.setOnClickListener(v -> showSets());
        root.addView(sets, matchWrap(dp(8)));

        Button management = button("Painel da Gerência", NAVY);
        management.setOnClickListener(v -> askOperator(this::showManagement));
        root.addView(management, matchWrap(dp(8)));

        Button reports = button("Relatórios", NAVY);
        reports.setOnClickListener(v -> askOperator(this::showReports));
        root.addView(reports, matchWrap(dp(8)));

        section("Segurança dos dados");
        Button backup = button("Fazer backup do banco", Color.rgb(70, 86, 104));
        backup.setOnClickListener(v -> startBackup());
        root.addView(backup, matchWrap(dp(8)));

        Button restore = button("Restaurar backup do banco", Color.rgb(70, 86, 104));
        restore.setOnClickListener(v -> confirmRestore());
        root.addView(restore, matchWrap(dp(8)));

        TextView local = text("Banco de dados: SQLite local neste Android. O aplicativo funciona sem internet.", 13, Color.DKGRAY, false);
        local.setPadding(0, dp(18), 0, 0);
        root.addView(local);
        setContentView(scroll);
    }

    private void askOperator(final Runnable after) {
        List<String> admins = db.activeAdminNames();
        if (admins.isEmpty()) {
            Toast.makeText(this, "Nenhum administrador ativo.", Toast.LENGTH_LONG).show();
            return;
        }
        final String[] items = admins.toArray(new String[0]);
        new AlertDialog.Builder(this)
                .setTitle("Operador da Gerência")
                .setSingleChoiceItems(items, 0, null)
                .setPositiveButton("Entrar", (dialog, which) -> {
                    AlertDialog ad = (AlertDialog) dialog;
                    int pos = ad.getListView().getCheckedItemPosition();
                    currentOperator = items[pos < 0 ? 0 : pos];
                    after.run();
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }

    private void showDrivers() {
        newScreen("Motoristas", "Cadastre uma vez e selecione o motorista nas viagens");
        addBackButton();
        section("Novo motorista");
        EditText name = field("Nome *", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        EditText cpf = field("CPF", InputType.TYPE_CLASS_PHONE);
        EditText phone = field("Telefone", InputType.TYPE_CLASS_PHONE);
        EditText cnh = field("CNH", InputType.TYPE_CLASS_TEXT);
        EditText category = field("Categoria da CNH (ex.: D ou E)", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS);
        List<String> statuses = new ArrayList<>();
        statuses.add("Ativo");
        statuses.add("Inativo");
        Spinner status = spinner(statuses);
        EditText commission = field("Comissão % (ex.: 0,20 para 20% ou 20)", InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);

        Button save = button("Salvar motorista", GOLD);
        save.setTextColor(NAVY);
        save.setOnClickListener(v -> {
            if (str(name).isEmpty()) {
                Toast.makeText(this, "Informe o nome do motorista.", Toast.LENGTH_SHORT).show();
                return;
            }
            double cp = num(commission);
            if (cp > 1) cp = cp / 100.0;
            long id = db.addDriver(str(name), str(cpf), str(phone), str(cnh), str(category), String.valueOf(status.getSelectedItem()), cp);
            if (id > 0) {
                Toast.makeText(this, "Motorista cadastrado.", Toast.LENGTH_SHORT).show();
                showDrivers();
            } else {
                Toast.makeText(this, "Não foi possível cadastrar.", Toast.LENGTH_LONG).show();
            }
        });
        root.addView(save, matchWrap(dp(12)));

        section("Motoristas cadastrados");
        Cursor c = db.driversCursor();
        if (!c.moveToFirst()) {
            root.addView(text("Nenhum motorista cadastrado.", 14, Color.DKGRAY, false), matchWrap(dp(6)));
        } else {
            do {
                double cp = c.getDouble(6);
                String line = c.getString(0) + "\nCNH: " + safe(c.getString(3)) + "  Categoria: " + safe(c.getString(4)) +
                        "\nStatus: " + c.getString(5) + "  Comissão: " + dec(cp * 100) + "%";
                addListCard(line);
            } while (c.moveToNext());
        }
        c.close();
    }

    private void showSets() {
        newScreen("Conjuntos de Carreta", "Cadastro compartilhado com o registro de viagens");
        addBackButton();
        section("Novo conjunto");
        EditText name = field("Nome do conjunto *", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        EditText horse = field("Placa do cavalo", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS);
        EditText trailer = field("Placa da carreta", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS);
        EditText model = field("Tipo / modelo", InputType.TYPE_CLASS_TEXT);
        List<String> statuses = new ArrayList<>();
        statuses.add("Ativo");
        statuses.add("Inativo");
        Spinner status = spinner(statuses);
        EditText notes = field("Observações", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);

        Button save = button("Salvar conjunto", GOLD);
        save.setTextColor(NAVY);
        save.setOnClickListener(v -> {
            if (str(name).isEmpty()) {
                Toast.makeText(this, "Informe o nome do conjunto.", Toast.LENGTH_SHORT).show();
                return;
            }
            long id = db.addSet(str(name), str(horse), str(trailer), str(model), String.valueOf(status.getSelectedItem()), str(notes));
            if (id > 0) {
                Toast.makeText(this, "Conjunto cadastrado.", Toast.LENGTH_SHORT).show();
                showSets();
            } else {
                Toast.makeText(this, "Não foi possível cadastrar.", Toast.LENGTH_LONG).show();
            }
        });
        root.addView(save, matchWrap(dp(12)));

        section("Conjuntos cadastrados");
        Cursor c = db.setsCursor();
        if (!c.moveToFirst()) {
            root.addView(text("Nenhum conjunto cadastrado.", 14, Color.DKGRAY, false), matchWrap(dp(6)));
        } else {
            do {
                String line = c.getString(0) + "\nCavalo: " + safe(c.getString(1)) + "  Carreta: " + safe(c.getString(2)) +
                        "\nModelo: " + safe(c.getString(3)) + "  Status: " + c.getString(4);
                addListCard(line);
            } while (c.moveToNext());
        }
        c.close();
    }

    private void showTrips() {
        newScreen("Viagens lançadas", "Selecione uma viagem para corrigir ou atualizar os dados");
        addBackButton();

        Button newTrip = button("＋ Registrar nova viagem", GOLD);
        newTrip.setTextColor(NAVY);
        newTrip.setOnClickListener(v -> showTripForm());
        root.addView(newTrip, matchWrap(dp(8)));

        section("Últimos lançamentos");
        Cursor c = db.editableTripsCursor(300);
        if (!c.moveToFirst()) {
            root.addView(text("Nenhuma viagem lançada.", 14, Color.DKGRAY, false), matchWrap(dp(6)));
        } else {
            do {
                String code = c.getString(0);
                String line = code + " • " + c.getString(1) + " • " + c.getString(2) +
                        "\nMotorista: " + c.getString(3) + "\nConjunto: " + c.getString(4) +
                        "\nTicket: " + safe(c.getString(5)) + " • Peso: " + dec(c.getDouble(6)) + " t" +
                        "\nFrete: " + money(c.getDouble(7)) + " • KM: " + dec(c.getDouble(8)) +
                        "\nOperador: " + safe(c.getString(9));
                addTripCard(line, code);
            } while (c.moveToNext());
        }
        c.close();
    }

    private void addTripCard(String line, String code) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(12), dp(10), dp(12), dp(10));
        card.setBackgroundColor(Color.WHITE);
        card.addView(text(line, 14, TEXT, false));
        Button edit = button("✎ Editar " + code, NAVY);
        edit.setOnClickListener(v -> showTripForm(code));
        card.addView(edit, matchWrap(dp(8)));
        root.addView(card, matchWrap(dp(8)));
    }

    private void showTripForm() {
        showTripForm(null);
    }

    private void showTripForm(String editCode) {
        boolean editing = editCode != null && !editCode.trim().isEmpty();
        String oldDate = "";
        String oldMode = "Por tonelada";
        String oldCompany = "";
        String oldOrigin = "";
        String oldDestination = "";
        String oldDriver = "";
        String oldSet = "";
        String oldTicket = "";
        double oldWeight = 0;
        double oldPriceTon = 0;
        double oldTripValue = 0;
        double oldKmInitial = 0;
        double oldKmFinal = 0;
        double oldLiters = 0;
        double oldDieselPrice = 0;
        String loadedOperator = "";
        String oldNotes = "";

        if (editing) {
            Cursor existing = db.tripByCode(editCode);
            if (!existing.moveToFirst()) {
                existing.close();
                Toast.makeText(this, "Viagem não encontrada.", Toast.LENGTH_LONG).show();
                showTrips();
                return;
            }
            oldDate = safeRaw(existing.getString(1));
            oldMode = safeRaw(existing.getString(2));
            oldCompany = safeRaw(existing.getString(3));
            oldOrigin = safeRaw(existing.getString(4));
            oldDestination = safeRaw(existing.getString(5));
            oldDriver = safeRaw(existing.getString(6));
            oldSet = safeRaw(existing.getString(7));
            oldTicket = safeRaw(existing.getString(8));
            oldWeight = existing.getDouble(9);
            oldPriceTon = existing.getDouble(10);
            oldTripValue = existing.getDouble(11);
            oldKmInitial = existing.getDouble(12);
            oldKmFinal = existing.getDouble(13);
            oldLiters = existing.getDouble(14);
            oldDieselPrice = existing.getDouble(15);
            loadedOperator = safeRaw(existing.getString(16));
            oldNotes = safeRaw(existing.getString(17));
            existing.close();
        }
        final String previousOperator = loadedOperator;

        List<String> drivers = db.activeDriverNames();
        List<String> sets = db.activeSetNames();
        ensureOption(drivers, oldDriver);
        ensureOption(sets, oldSet);
        if (drivers.isEmpty()) {
            Toast.makeText(this, "Cadastre pelo menos um motorista primeiro.", Toast.LENGTH_LONG).show();
            showDrivers();
            return;
        }
        if (sets.isEmpty()) {
            Toast.makeText(this, "Cadastre pelo menos um conjunto primeiro.", Toast.LENGTH_LONG).show();
            showSets();
            return;
        }

        newScreen(editing ? "Editar Viagem " + editCode : "Registrar Viagem",
                editing ? "Altere os dados e toque em salvar. Os cálculos serão refeitos automaticamente." :
                        "Os cálculos seguem a lógica da planilha Trans Salomão");
        addBackButton();

        if (editing) {
            TextView warning = text("Você está editando uma viagem já lançada. O código " + editCode + " será mantido.", 14, NAVY, true);
            warning.setPadding(dp(12), dp(10), dp(12), dp(10));
            warning.setBackgroundColor(Color.WHITE);
            root.addView(warning, matchWrap(dp(8)));
        }

        section("Dados principais");
        EditText date = field("Data (AAAA-MM-DD)", InputType.TYPE_CLASS_DATETIME);
        date.setText(editing ? oldDate : new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date()));
        List<String> modes = new ArrayList<>();
        modes.add("Por tonelada");
        modes.add("Por viagem");
        Spinner mode = spinner(modes);
        if (editing) selectSpinner(mode, oldMode);
        EditText company = field("Empresa contratante", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        company.setText(oldCompany);
        EditText origin = field("Origem", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        origin.setText(oldOrigin);
        EditText destination = field("Descarga", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        destination.setText(oldDestination);
        Spinner driver = spinner(drivers);
        if (editing) selectSpinner(driver, oldDriver);
        Spinner set = spinner(sets);
        if (editing) selectSpinner(set, oldSet);
        EditText ticket = field("Ticket de pesagem", InputType.TYPE_CLASS_TEXT);
        ticket.setText(oldTicket);

        section("Frete");
        EditText weight = field("Peso líquido (t) *", InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        if (editing) weight.setText(editNum(oldWeight));
        EditText priceTon = field("Preço por tonelada (R$/t)", InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        if (editing) priceTon.setText(editNum(oldPriceTon));
        EditText tripValue = field("Valor da viagem (modo Por viagem)", InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        if (editing) tripValue.setText(editNum(oldTripValue));

        section("KM e combustível");
        EditText kmInitial = field("KM inicial", InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        if (editing) kmInitial.setText(editNum(oldKmInitial));
        EditText kmFinal = field("KM final / atual", InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        if (editing) kmFinal.setText(editNum(oldKmFinal));
        EditText liters = field("Litros de diesel", InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        if (editing) liters.setText(editNum(oldLiters));
        EditText dieselPrice = field("Preço do diesel (R$/L)", InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        if (editing) dieselPrice.setText(editNum(oldDieselPrice));
        EditText notes = field("Observações", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        notes.setText(oldNotes);

        TextView calc = text("Ao salvar serão recalculados: frete, KM rodados, KM/L, custo do diesel, comissão e resultado.", 13, Color.DKGRAY, false);
        calc.setPadding(0, dp(12), 0, 0);
        root.addView(calc);

        Button save = button(editing ? "Salvar alterações da viagem" : "Calcular e salvar viagem", GOLD);
        save.setTextColor(NAVY);
        save.setOnClickListener(v -> {
            String driverName = String.valueOf(driver.getSelectedItem());
            String setName = String.valueOf(set.getSelectedItem());
            String freightMode = String.valueOf(mode.getSelectedItem());
            double w = num(weight);
            double pt = num(priceTon);
            double tv = num(tripValue);
            double ki = num(kmInitial);
            double kf = num(kmFinal);
            double l = num(liters);
            double dieselPriceValue = num(dieselPrice);

            if (str(date).isEmpty() || w <= 0) {
                Toast.makeText(this, "Informe a data e o peso líquido.", Toast.LENGTH_LONG).show();
                return;
            }
            if ("Por tonelada".equals(freightMode) && pt <= 0) {
                Toast.makeText(this, "Informe o preço por tonelada.", Toast.LENGTH_LONG).show();
                return;
            }
            if ("Por viagem".equals(freightMode) && tv <= 0) {
                Toast.makeText(this, "Informe o valor da viagem.", Toast.LENGTH_LONG).show();
                return;
            }

            double km = Math.max(0, kf - ki);
            double freight = "Por viagem".equals(freightMode) ? tv : w * pt;
            double kml = l > 0 ? km / l : 0;
            double dieselCost = l * dieselPriceValue;
            double gross = freight - dieselCost;
            double commissionPct = db.commissionForDriver(driverName);
            double commissionValue = freight * commissionPct;
            double after = gross - commissionValue;
            String operator = currentOperator.isEmpty() ? (editing && !previousOperator.isEmpty() ? previousOperator : "Operação") : currentOperator;

            if (editing) {
                int changed = db.updateTrip(editCode, str(date), freightMode, str(company), str(origin), str(destination), driverName, setName,
                        str(ticket), w, pt, tv, ki, kf, km, l, dieselPriceValue, freight, kml, dieselCost, gross,
                        commissionPct, commissionValue, after, operator, str(notes));
                if (changed > 0) {
                    new AlertDialog.Builder(this)
                            .setTitle("Viagem atualizada — " + editCode)
                            .setMessage("Frete: " + money(freight) + "\nKM rodados: " + dec(km) +
                                    "\nKM/L: " + dec(kml) + "\nDiesel: " + money(dieselCost) +
                                    "\nComissão: " + money(commissionValue) + "\nApós comissão: " + money(after))
                            .setPositiveButton("OK", (d, w1) -> showTrips())
                            .show();
                } else {
                    Toast.makeText(this, "Não foi possível atualizar a viagem.", Toast.LENGTH_LONG).show();
                }
            } else {
                String code = db.nextTripCode();
                long id = db.addTrip(code, str(date), freightMode, str(company), str(origin), str(destination), driverName, setName,
                        str(ticket), w, pt, tv, ki, kf, km, l, dieselPriceValue, freight, kml, dieselCost, gross,
                        commissionPct, commissionValue, after, operator, str(notes));
                if (id > 0) {
                    new AlertDialog.Builder(this)
                            .setTitle("Viagem salva — " + code)
                            .setMessage("Frete: " + money(freight) + "\nKM rodados: " + dec(km) +
                                    "\nKM/L: " + dec(kml) + "\nDiesel: " + money(dieselCost) +
                                    "\nComissão: " + money(commissionValue) + "\nApós comissão: " + money(after))
                            .setPositiveButton("OK", (d, w1) -> showHome())
                            .show();
                } else {
                    Toast.makeText(this, "Erro ao salvar a viagem.", Toast.LENGTH_LONG).show();
                }
            }
        });
        root.addView(save, matchWrap(dp(14)));
    }

    private void showManagement() {
        newScreen("Painel da Gerência", "Operador atual: " + currentOperator);
        addBackButton();
        double[] s = db.summary("Completo");
        addKpi("Motoristas cadastrados", String.valueOf(db.countDrivers()));
        addKpi("Conjuntos cadastrados", String.valueOf(db.countSets()));
        addKpi("Viagens", String.valueOf((int) s[0]));
        addKpi("Faturamento", money(s[3]));
        addKpi("Resultado após comissão", money(s[8]));

        section("Gerenciamento");
        Button editTrips = button("✎ Editar viagens lançadas", GOLD);
        editTrips.setTextColor(NAVY);
        editTrips.setOnClickListener(v -> showTrips());
        root.addView(editTrips, matchWrap(dp(8)));
        Button drivers = button("Gerenciar motoristas", NAVY);
        drivers.setOnClickListener(v -> showDrivers());
        root.addView(drivers, matchWrap(dp(8)));
        Button sets = button("Gerenciar conjuntos", NAVY);
        sets.setOnClickListener(v -> showSets());
        root.addView(sets, matchWrap(dp(8)));
        Button trip = button("Registrar viagem", NAVY);
        trip.setOnClickListener(v -> showTripForm());
        root.addView(trip, matchWrap(dp(8)));
        Button reports = button("Abrir relatórios", NAVY);
        reports.setOnClickListener(v -> showReports());
        root.addView(reports, matchWrap(dp(8)));

        section("Administradores oficiais");
        Cursor c = db.adminsCursor();
        while (c.moveToNext()) {
            addListCard(c.getString(0) + " — " + c.getString(1) + "\n" + c.getString(2) + " • " + safe(c.getString(3)));
        }
        c.close();
    }

    private void showReports() {
        newScreen("Relatórios", "Emitido por: " + (currentOperator.isEmpty() ? "Operação" : currentOperator));
        addBackButton();
        section("Período");
        List<String> periods = new ArrayList<>();
        periods.add("Completo");
        periods.add("Hoje");
        periods.add("7 dias");
        periods.add("30 dias");
        Spinner period = spinner(periods);
        Button generate = button("Gerar relatório", GOLD);
        generate.setTextColor(NAVY);
        root.addView(generate, matchWrap(dp(8)));
        LinearLayout reportBox = new LinearLayout(this);
        reportBox.setOrientation(LinearLayout.VERTICAL);
        root.addView(reportBox, matchWrap(dp(10)));

        generate.setOnClickListener(v -> {
            reportBox.removeAllViews();
            String p = String.valueOf(period.getSelectedItem());
            String report = buildReportText(p);
            pendingReportText = report;
            pendingReportPeriod = p;
            TextView tv = text(report, 14, TEXT, false);
            tv.setTextIsSelectable(true);
            tv.setPadding(dp(12), dp(12), dp(12), dp(12));
            tv.setBackgroundColor(Color.WHITE);
            reportBox.addView(tv, matchWrap(0));
            Button pdf = button("Salvar relatório em PDF", NAVY);
            pdf.setOnClickListener(x -> startPdfSave());
            reportBox.addView(pdf, matchWrap(dp(10)));
        });
        generate.performClick();
    }

    private String buildReportText(String period) {
        double[] s = db.summary(period);
        double[] modes = db.freightModeSummary(period);
        StringBuilder b = new StringBuilder();
        b.append("TRANS SALOMÃO — RELATÓRIO\n");
        b.append("Movendo caminhos, entregando confiança\n\n");
        b.append("Período: ").append(period).append("\n");
        b.append("Emitido por: ").append(currentOperator.isEmpty() ? "Operação" : currentOperator).append("\n");
        b.append("Emissão: ").append(new SimpleDateFormat("dd/MM/yyyy HH:mm", ptBR).format(new Date())).append("\n\n");
        b.append("Viagens: ").append((int) s[0]).append("\n");
        b.append("Peso líquido: ").append(dec(s[1])).append(" t\n");
        b.append("KM rodados: ").append(dec(s[2])).append(" km\n");
        b.append("Faturamento: ").append(money(s[3])).append("\n");
        b.append("  Por tonelada: ").append(money(modes[0])).append("\n");
        b.append("  Por viagem: ").append(money(modes[1])).append("\n");
        b.append("Diesel consumido: ").append(dec(s[4])).append(" L\n");
        b.append("Custo do diesel: ").append(money(s[5])).append("\n");
        b.append("Resultado bruto: ").append(money(s[6])).append("\n");
        b.append("Comissões: ").append(money(s[7])).append("\n");
        b.append("Resultado após comissão: ").append(money(s[8])).append("\n");
        b.append("Média KM/L: ").append(dec(s[9])).append("\n\n");
        b.append("VIAGENS\n");
        Cursor c = db.tripsCursor(period, 100);
        if (!c.moveToFirst()) {
            b.append("Nenhuma viagem no período.\n");
        } else {
            do {
                b.append(c.getString(0)).append(" | ").append(c.getString(1)).append(" | ")
                        .append(c.getString(3)).append(" | ").append(c.getString(4)).append("\n")
                        .append("  Ticket: ").append(safe(c.getString(5))).append(" | Peso: ").append(dec(c.getDouble(6))).append(" t | Frete: ")
                        .append(money(c.getDouble(7))).append(" | KM: ").append(dec(c.getDouble(8))).append("\n")
                        .append("  Comissão: ").append(money(c.getDouble(9))).append(" | Após comissão: ").append(money(c.getDouble(10)))
                        .append(" | Operador: ").append(safe(c.getString(11))).append("\n\n");
            } while (c.moveToNext());
        }
        c.close();
        return b.toString();
    }

    private void addListCard(String line) {
        TextView t = text(line, 14, TEXT, false);
        t.setPadding(dp(12), dp(10), dp(12), dp(10));
        t.setBackgroundColor(Color.WHITE);
        root.addView(t, matchWrap(dp(6)));
    }

    private String safe(String s) {
        return s == null || s.trim().isEmpty() ? "—" : s;
    }

    private String safeRaw(String s) {
        return s == null ? "" : s;
    }

    private void startBackup() {
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("application/octet-stream");
        i.putExtra(Intent.EXTRA_TITLE, "TransSalomao_backup_" + new SimpleDateFormat("yyyyMMdd_HHmm", Locale.US).format(new Date()) + ".db");
        startActivityForResult(i, REQ_BACKUP);
    }

    private void confirmRestore() {
        new AlertDialog.Builder(this)
                .setTitle("Restaurar backup")
                .setMessage("A restauração substituirá os dados atuais do aplicativo pelos dados do arquivo de backup escolhido.")
                .setPositiveButton("Escolher backup", (d, w) -> startRestore())
                .setNegativeButton("Cancelar", null)
                .show();
    }

    private void startRestore() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("application/octet-stream");
        startActivityForResult(i, REQ_RESTORE);
    }

    private void startPdfSave() {
        if (pendingReportText == null || pendingReportText.isEmpty()) {
            Toast.makeText(this, "Gere o relatório primeiro.", Toast.LENGTH_SHORT).show();
            return;
        }
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("application/pdf");
        i.putExtra(Intent.EXTRA_TITLE, "TransSalomao_Relatorio_" + pendingReportPeriod.replace(" ", "_") + "_" + new SimpleDateFormat("yyyyMMdd_HHmm", Locale.US).format(new Date()) + ".pdf");
        startActivityForResult(i, REQ_PDF);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        try {
            if (requestCode == REQ_BACKUP) {
                db.close();
                File source = getDatabasePath(DbHelper.DB_NAME);
                try (InputStream in = new FileInputStream(source); OutputStream out = getContentResolver().openOutputStream(uri)) {
                    copy(in, out);
                }
                db = new DbHelper(this);
                Toast.makeText(this, "Backup salvo com sucesso.", Toast.LENGTH_LONG).show();
            } else if (requestCode == REQ_RESTORE) {
                db.close();
                File target = getDatabasePath(DbHelper.DB_NAME);
                File parent = target.getParentFile();
                if (parent != null && !parent.exists()) parent.mkdirs();
                new File(target.getPath() + "-wal").delete();
                new File(target.getPath() + "-shm").delete();
                try (InputStream in = getContentResolver().openInputStream(uri); OutputStream out = new FileOutputStream(target, false)) {
                    copy(in, out);
                }
                db = new DbHelper(this);
                db.getReadableDatabase();
                Toast.makeText(this, "Backup restaurado com sucesso.", Toast.LENGTH_LONG).show();
                showHome();
            } else if (requestCode == REQ_PDF) {
                writeReportPdf(uri, pendingReportText);
                Toast.makeText(this, "PDF salvo com sucesso.", Toast.LENGTH_LONG).show();
            }
        } catch (Exception e) {
            db = new DbHelper(this);
            Toast.makeText(this, "Erro ao processar arquivo: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void copy(InputStream in, OutputStream out) throws Exception {
        if (in == null || out == null) throw new Exception("Não foi possível abrir o arquivo.");
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        out.flush();
    }

    private void writeReportPdf(Uri uri, String report) throws Exception {
        PdfDocument doc = new PdfDocument();
        Paint paint = new Paint();
        paint.setColor(Color.BLACK);
        paint.setTextSize(11f);
        paint.setAntiAlias(true);
        String[] lines = report.split("\\n", -1);
        int pageNo = 1;
        int idx = 0;
        while (idx < lines.length) {
            PdfDocument.PageInfo info = new PdfDocument.PageInfo.Builder(595, 842, pageNo++).create();
            PdfDocument.Page page = doc.startPage(info);
            float y = 42;
            while (idx < lines.length && y < 805) {
                String line = lines[idx++];
                if (line.length() > 88) {
                    int start = 0;
                    while (start < line.length() && y < 805) {
                        int end = Math.min(start + 88, line.length());
                        page.getCanvas().drawText(line.substring(start, end), 36, y, paint);
                        y += 15;
                        start = end;
                    }
                } else {
                    page.getCanvas().drawText(line, 36, y, paint);
                    y += 15;
                }
            }
            doc.finishPage(page);
        }
        try (OutputStream out = getContentResolver().openOutputStream(uri)) {
            doc.writeTo(out);
        }
        doc.close();
    }

    @Override
    public void onBackPressed() {
        if (!onHome) showHome();
        else super.onBackPressed();
    }
}
