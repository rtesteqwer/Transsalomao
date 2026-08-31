package com.transsalomao.fretes;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import java.util.ArrayList;
import java.util.List;

public class DbHelper extends SQLiteOpenHelper {
    public static final String DB_NAME = "trans_salomao.db";
    private static final int DB_VERSION = 1;

    public DbHelper(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE drivers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, cpf TEXT, phone TEXT, cnh TEXT, category TEXT, status TEXT NOT NULL DEFAULT 'Ativo', commission REAL NOT NULL DEFAULT 0)");
        db.execSQL("CREATE TABLE sets_truck (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, horse_plate TEXT, trailer_plate TEXT, model TEXT, status TEXT NOT NULL DEFAULT 'Ativo', notes TEXT)");
        db.execSQL("CREATE TABLE admins (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, hierarchy TEXT NOT NULL, status TEXT NOT NULL, notes TEXT)");
        db.execSQL("CREATE TABLE trips (id INTEGER PRIMARY KEY AUTOINCREMENT, trip_code TEXT UNIQUE, date TEXT NOT NULL, freight_mode TEXT NOT NULL, company TEXT, origin TEXT, destination TEXT, driver_name TEXT NOT NULL, set_name TEXT NOT NULL, ticket TEXT, net_weight REAL NOT NULL DEFAULT 0, price_per_ton REAL NOT NULL DEFAULT 0, trip_value REAL NOT NULL DEFAULT 0, km_initial REAL NOT NULL DEFAULT 0, km_final REAL NOT NULL DEFAULT 0, km_rodados REAL NOT NULL DEFAULT 0, diesel_liters REAL NOT NULL DEFAULT 0, diesel_price REAL NOT NULL DEFAULT 0, freight_value REAL NOT NULL DEFAULT 0, km_l REAL NOT NULL DEFAULT 0, diesel_cost REAL NOT NULL DEFAULT 0, gross_result REAL NOT NULL DEFAULT 0, commission_pct REAL NOT NULL DEFAULT 0, commission_value REAL NOT NULL DEFAULT 0, after_commission REAL NOT NULL DEFAULT 0, operator TEXT, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)");

        insertAdmin(db, "Felipe");
        insertAdmin(db, "Murillo");
        insertAdmin(db, "Emanuel");
        insertAdmin(db, "Clovis");
        insertAdmin(db, "Gizele");
    }

    private void insertAdmin(SQLiteDatabase db, String name) {
        ContentValues v = new ContentValues();
        v.put("name", name);
        v.put("hierarchy", "Administrador");
        v.put("status", "Ativo");
        v.put("notes", "Acesso total");
        db.insert("admins", null, v);
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // Primeira versão. Migrações futuras serão adicionadas aqui.
    }

    public long addDriver(String name, String cpf, String phone, String cnh, String category, String status, double commission) {
        ContentValues v = new ContentValues();
        v.put("name", name);
        v.put("cpf", cpf);
        v.put("phone", phone);
        v.put("cnh", cnh);
        v.put("category", category);
        v.put("status", status);
        v.put("commission", commission);
        return getWritableDatabase().insert("drivers", null, v);
    }

    public long addSet(String name, String horsePlate, String trailerPlate, String model, String status, String notes) {
        ContentValues v = new ContentValues();
        v.put("name", name);
        v.put("horse_plate", horsePlate);
        v.put("trailer_plate", trailerPlate);
        v.put("model", model);
        v.put("status", status);
        v.put("notes", notes);
        return getWritableDatabase().insert("sets_truck", null, v);
    }

    public List<String> activeDriverNames() {
        List<String> out = new ArrayList<>();
        Cursor c = getReadableDatabase().rawQuery("SELECT name FROM drivers WHERE status='Ativo' ORDER BY name COLLATE NOCASE", null);
        while (c.moveToNext()) out.add(c.getString(0));
        c.close();
        return out;
    }

    public List<String> activeSetNames() {
        List<String> out = new ArrayList<>();
        Cursor c = getReadableDatabase().rawQuery("SELECT name FROM sets_truck WHERE status='Ativo' ORDER BY name COLLATE NOCASE", null);
        while (c.moveToNext()) out.add(c.getString(0));
        c.close();
        return out;
    }

    public List<String> activeAdminNames() {
        List<String> out = new ArrayList<>();
        Cursor c = getReadableDatabase().rawQuery("SELECT name FROM admins WHERE status='Ativo' ORDER BY id", null);
        while (c.moveToNext()) out.add(c.getString(0));
        c.close();
        return out;
    }

    public double commissionForDriver(String name) {
        Cursor c = getReadableDatabase().rawQuery("SELECT commission FROM drivers WHERE name=? ORDER BY id DESC LIMIT 1", new String[]{name});
        double value = 0;
        if (c.moveToFirst()) value = c.getDouble(0);
        c.close();
        return value;
    }

    public String nextTripCode() {
        Cursor c = getReadableDatabase().rawQuery("SELECT COALESCE(MAX(id),0)+1 FROM trips", null);
        int n = 1;
        if (c.moveToFirst()) n = c.getInt(0);
        c.close();
        return String.format("V-%04d", n);
    }

    public long addTrip(String tripCode, String date, String freightMode, String company, String origin,
                        String destination, String driverName, String setName, String ticket,
                        double netWeight, double pricePerTon, double tripValue, double kmInitial,
                        double kmFinal, double kmRodados, double dieselLiters, double dieselPrice,
                        double freightValue, double kmL, double dieselCost, double grossResult,
                        double commissionPct, double commissionValue, double afterCommission,
                        String operator, String notes) {
        ContentValues v = new ContentValues();
        v.put("trip_code", tripCode);
        v.put("date", date);
        v.put("freight_mode", freightMode);
        v.put("company", company);
        v.put("origin", origin);
        v.put("destination", destination);
        v.put("driver_name", driverName);
        v.put("set_name", setName);
        v.put("ticket", ticket);
        v.put("net_weight", netWeight);
        v.put("price_per_ton", pricePerTon);
        v.put("trip_value", tripValue);
        v.put("km_initial", kmInitial);
        v.put("km_final", kmFinal);
        v.put("km_rodados", kmRodados);
        v.put("diesel_liters", dieselLiters);
        v.put("diesel_price", dieselPrice);
        v.put("freight_value", freightValue);
        v.put("km_l", kmL);
        v.put("diesel_cost", dieselCost);
        v.put("gross_result", grossResult);
        v.put("commission_pct", commissionPct);
        v.put("commission_value", commissionValue);
        v.put("after_commission", afterCommission);
        v.put("operator", operator);
        v.put("notes", notes);
        return getWritableDatabase().insert("trips", null, v);
    }

    public Cursor driversCursor() {
        return getReadableDatabase().rawQuery("SELECT name, cpf, phone, cnh, category, status, commission FROM drivers ORDER BY id DESC", null);
    }

    public Cursor setsCursor() {
        return getReadableDatabase().rawQuery("SELECT name, horse_plate, trailer_plate, model, status, notes FROM sets_truck ORDER BY id DESC", null);
    }

    public Cursor adminsCursor() {
        return getReadableDatabase().rawQuery("SELECT name, hierarchy, status, notes FROM admins ORDER BY id", null);
    }

    private String dateConditionForPeriod(String period) {
        if ("Hoje".equals(period)) return "date(date)=date('now','localtime')";
        if ("7 dias".equals(period)) return "date(date)>=date('now','localtime','-6 day')";
        if ("30 dias".equals(period)) return "date(date)>=date('now','localtime','-29 day')";
        return "1=1";
    }

    public double[] summary(String period) {
        String where = dateConditionForPeriod(period);
        String sql = "SELECT COUNT(*), COALESCE(SUM(net_weight),0), COALESCE(SUM(km_rodados),0), COALESCE(SUM(freight_value),0), COALESCE(SUM(diesel_liters),0), COALESCE(SUM(diesel_cost),0), COALESCE(SUM(gross_result),0), COALESCE(SUM(commission_value),0), COALESCE(SUM(after_commission),0), COALESCE(AVG(CASE WHEN km_l>0 THEN km_l END),0) FROM trips WHERE " + where;
        Cursor c = getReadableDatabase().rawQuery(sql, null);
        double[] s = new double[10];
        if (c.moveToFirst()) {
            for (int i = 0; i < s.length; i++) s[i] = c.getDouble(i);
        }
        c.close();
        return s;
    }

    public double[] freightModeSummary(String period) {
        String where = dateConditionForPeriod(period);
        Cursor c = getReadableDatabase().rawQuery(
                "SELECT COALESCE(SUM(CASE WHEN freight_mode='Por tonelada' THEN freight_value ELSE 0 END),0), COALESCE(SUM(CASE WHEN freight_mode='Por viagem' THEN freight_value ELSE 0 END),0) FROM trips WHERE " + where,
                null);
        double[] s = new double[2];
        if (c.moveToFirst()) {
            s[0] = c.getDouble(0);
            s[1] = c.getDouble(1);
        }
        c.close();
        return s;
    }

    public Cursor tripsCursor(String period, int limit) {
        String where = dateConditionForPeriod(period);
        return getReadableDatabase().rawQuery(
                "SELECT trip_code, date, freight_mode, driver_name, set_name, ticket, net_weight, freight_value, km_rodados, commission_value, after_commission, operator FROM trips WHERE " + where + " ORDER BY id DESC LIMIT " + limit,
                null);
    }

    public int countDrivers() {
        Cursor c = getReadableDatabase().rawQuery("SELECT COUNT(*) FROM drivers", null);
        int n = c.moveToFirst() ? c.getInt(0) : 0;
        c.close();
        return n;
    }

    public int countSets() {
        Cursor c = getReadableDatabase().rawQuery("SELECT COUNT(*) FROM sets_truck", null);
        int n = c.moveToFirst() ? c.getInt(0) : 0;
        c.close();
        return n;
    }
}
