package com.transsalomao.voice;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class AssistantMemory extends SQLiteOpenHelper {
    private static final String DB_NAME = "salomao_assistant.db";
    private static final int DB_VERSION = 2;

    public static class ChatMessage {
        public final String role;
        public final String content;
        public final long createdAt;
        public ChatMessage(String role, String content, long createdAt) {
            this.role = role;
            this.content = content;
            this.createdAt = createdAt;
        }
    }

    public AssistantMemory(Context context) { super(context, DB_NAME, null, DB_VERSION); }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE command_history (id INTEGER PRIMARY KEY AUTOINCREMENT,utterance TEXT NOT NULL,normalized TEXT NOT NULL,result TEXT,success INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL)");
        db.execSQL("CREATE TABLE learned_action (command TEXT NOT NULL,page TEXT NOT NULL,selector TEXT NOT NULL,label TEXT,success_count INTEGER NOT NULL DEFAULT 1,last_used INTEGER NOT NULL,PRIMARY KEY(command,page))");
        db.execSQL("CREATE TABLE fact_memory (memory_key TEXT PRIMARY KEY,memory_value TEXT NOT NULL,updated_at INTEGER NOT NULL)");
        createChatTable(db);
        db.execSQL("CREATE INDEX idx_history_created ON command_history(created_at DESC)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        if (oldVersion < 2) createChatTable(db);
    }

    private void createChatTable(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE IF NOT EXISTS chat_message (id INTEGER PRIMARY KEY AUTOINCREMENT,role TEXT NOT NULL,content TEXT NOT NULL,created_at INTEGER NOT NULL)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_message(created_at DESC)");
    }

    public synchronized void addChat(String role, String content) {
        if (content == null || content.trim().isEmpty()) return;
        getWritableDatabase().execSQL("INSERT INTO chat_message(role,content,created_at) VALUES(?,?,?)",
                new Object[]{"assistant".equals(role) ? "assistant" : "user", content, System.currentTimeMillis()});
        getWritableDatabase().execSQL("DELETE FROM chat_message WHERE id NOT IN (SELECT id FROM chat_message ORDER BY created_at DESC,id DESC LIMIT 200)");
    }

    public synchronized List<ChatMessage> recentChat(int limit) {
        ArrayList<ChatMessage> out = new ArrayList<>();
        Cursor c = getReadableDatabase().rawQuery(
                "SELECT role,content,created_at FROM chat_message ORDER BY created_at DESC,id DESC LIMIT ?",
                new String[]{String.valueOf(Math.max(1, Math.min(limit, 200)))});
        try {
            while (c.moveToNext()) out.add(new ChatMessage(c.getString(0), c.getString(1), c.getLong(2)));
        } finally { c.close(); }
        Collections.reverse(out);
        return out;
    }

    public synchronized int chatCount() { return scalar("SELECT COUNT(*) FROM chat_message"); }

    public synchronized void logCommand(String utterance, String normalized, String result, boolean success) {
        getWritableDatabase().execSQL("INSERT INTO command_history(utterance,normalized,result,success,created_at) VALUES(?,?,?,?,?)",
                new Object[]{safe(utterance), safe(normalized), safe(result), success ? 1 : 0, System.currentTimeMillis()});
    }

    public synchronized void rememberFact(String key, String value) {
        if (blank(key) || blank(value)) return;
        getWritableDatabase().execSQL("INSERT INTO fact_memory(memory_key,memory_value,updated_at) VALUES(?,?,?) ON CONFLICT(memory_key) DO UPDATE SET memory_value=excluded.memory_value,updated_at=excluded.updated_at",
                new Object[]{key, value, System.currentTimeMillis()});
    }

    public synchronized String recallFact(String key) {
        Cursor c = getReadableDatabase().rawQuery("SELECT memory_value FROM fact_memory WHERE memory_key=? LIMIT 1", new String[]{key});
        try { return c.moveToFirst() ? c.getString(0) : null; }
        finally { c.close(); }
    }

    public synchronized int historyCount() { return scalar("SELECT COUNT(*) FROM command_history"); }
    public synchronized int factsCount() { return scalar("SELECT COUNT(*) FROM fact_memory"); }
    public synchronized int learnedCount() { return scalar("SELECT COUNT(*) FROM learned_action"); }

    private int scalar(String sql) {
        Cursor c = getReadableDatabase().rawQuery(sql, null);
        try { return c.moveToFirst() ? c.getInt(0) : 0; }
        finally { c.close(); }
    }

    private static boolean blank(String s) { return s == null || s.trim().isEmpty(); }
    private static String safe(String s) { return s == null ? "" : s; }
}
