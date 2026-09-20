package com.transsalomao.voice;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

public class AssistantMemory extends SQLiteOpenHelper {
    private static final String DB_NAME = "salomao_assistant.db";
    private static final int DB_VERSION = 1;

    public static class LearnedAction {
        public final String command;
        public final String page;
        public final String selector;
        public final String label;
        public final int successCount;

        LearnedAction(String command, String page, String selector, String label, int successCount) {
            this.command = command;
            this.page = page;
            this.selector = selector;
            this.label = label;
            this.successCount = successCount;
        }
    }

    public AssistantMemory(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE command_history (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "utterance TEXT NOT NULL," +
                "normalized TEXT NOT NULL," +
                "result TEXT," +
                "success INTEGER NOT NULL DEFAULT 0," +
                "created_at INTEGER NOT NULL)");
        db.execSQL("CREATE TABLE learned_action (" +
                "command TEXT NOT NULL," +
                "page TEXT NOT NULL," +
                "selector TEXT NOT NULL," +
                "label TEXT," +
                "success_count INTEGER NOT NULL DEFAULT 1," +
                "last_used INTEGER NOT NULL," +
                "PRIMARY KEY(command,page))");
        db.execSQL("CREATE TABLE fact_memory (" +
                "memory_key TEXT PRIMARY KEY," +
                "memory_value TEXT NOT NULL," +
                "updated_at INTEGER NOT NULL)");
        db.execSQL("CREATE INDEX idx_history_created ON command_history(created_at DESC)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {}

    public synchronized void logCommand(String utterance, String normalized, String result, boolean success) {
        SQLiteDatabase db = getWritableDatabase();
        db.execSQL("INSERT INTO command_history(utterance,normalized,result,success,created_at) VALUES(?,?,?,?,?)",
                new Object[]{safe(utterance), safe(normalized), safe(result), success ? 1 : 0, System.currentTimeMillis()});
    }

    public synchronized void learnAction(String command, String page, String selector, String label) {
        if (blank(command) || blank(selector)) return;
        SQLiteDatabase db = getWritableDatabase();
        db.execSQL("INSERT INTO learned_action(command,page,selector,label,success_count,last_used) VALUES(?,?,?,?,1,?) " +
                        "ON CONFLICT(command,page) DO UPDATE SET selector=excluded.selector,label=excluded.label," +
                        "success_count=learned_action.success_count+1,last_used=excluded.last_used",
                new Object[]{command, safe(page), selector, safe(label), System.currentTimeMillis()});
    }

    public synchronized LearnedAction findAction(String command, String page) {
        SQLiteDatabase db = getReadableDatabase();
        Cursor c = db.rawQuery("SELECT command,page,selector,label,success_count FROM learned_action " +
                        "WHERE command=? AND page=? LIMIT 1",
                new String[]{command, safe(page)});
        try {
            if (c.moveToFirst()) {
                return new LearnedAction(c.getString(0), c.getString(1), c.getString(2), c.getString(3), c.getInt(4));
            }
        } finally {
            c.close();
        }
        return null;
    }

    public synchronized void rememberFact(String key, String value) {
        if (blank(key) || blank(value)) return;
        SQLiteDatabase db = getWritableDatabase();
        db.execSQL("INSERT INTO fact_memory(memory_key,memory_value,updated_at) VALUES(?,?,?) " +
                        "ON CONFLICT(memory_key) DO UPDATE SET memory_value=excluded.memory_value,updated_at=excluded.updated_at",
                new Object[]{key, value, System.currentTimeMillis()});
    }

    public synchronized String recallFact(String key) {
        SQLiteDatabase db = getReadableDatabase();
        Cursor c = db.rawQuery("SELECT memory_value FROM fact_memory WHERE memory_key=? LIMIT 1", new String[]{key});
        try {
            return c.moveToFirst() ? c.getString(0) : null;
        } finally {
            c.close();
        }
    }

    public synchronized int learnedCount() {
        return scalar("SELECT COUNT(*) FROM learned_action");
    }

    public synchronized int historyCount() {
        return scalar("SELECT COUNT(*) FROM command_history");
    }

    public synchronized int factsCount() {
        return scalar("SELECT COUNT(*) FROM fact_memory");
    }

    public synchronized String recentSummary(int limit) {
        StringBuilder out = new StringBuilder();
        Cursor c = getReadableDatabase().rawQuery(
                "SELECT utterance,result,success FROM command_history ORDER BY created_at DESC LIMIT ?",
                new String[]{String.valueOf(Math.max(1, Math.min(limit, 30)))});
        try {
            while (c.moveToNext()) {
                if (out.length() > 0) out.append("\n");
                out.append(c.getInt(2) == 1 ? "✓ " : "• ")
                        .append(c.getString(0));
                String result = c.getString(1);
                if (result != null && !result.isEmpty()) out.append(" → ").append(result);
            }
        } finally {
            c.close();
        }
        return out.length() == 0 ? "Ainda não há comandos gravados." : out.toString();
    }

    private int scalar(String sql) {
        Cursor c = getReadableDatabase().rawQuery(sql, null);
        try { return c.moveToFirst() ? c.getInt(0) : 0; }
        finally { c.close(); }
    }

    private static boolean blank(String s) { return s == null || s.trim().isEmpty(); }
    private static String safe(String s) { return s == null ? "" : s; }
}
