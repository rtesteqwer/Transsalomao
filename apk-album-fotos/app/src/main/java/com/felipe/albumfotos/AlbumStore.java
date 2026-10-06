package com.felipe.albumfotos;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class AlbumStore {
    private static final String PREFS = "albums_prefs";
    private static final String KEY = "albums";

    private AlbumStore() {}

    public static List<String> getAlbums(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        Set<String> values = prefs.getStringSet(KEY, new HashSet<>());
        List<String> albums = new ArrayList<>(values == null ? Collections.emptySet() : values);
        Collections.sort(albums, String.CASE_INSENSITIVE_ORDER);
        return albums;
    }

    public static void addAlbum(Context context, String name) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        Set<String> copy = new HashSet<>(prefs.getStringSet(KEY, new HashSet<>()));
        copy.add(name);
        prefs.edit().putStringSet(KEY, copy).apply();
    }

    public static String sanitizeAlbumName(String raw) {
        String name = raw == null ? "" : raw.trim();
        name = name.replaceAll("[\\\\/:*?\"<>|]", "-");
        name = name.replaceAll("\\s+", " ");
        while (name.endsWith(".") || name.endsWith(" ")) {
            name = name.substring(0, name.length() - 1);
        }
        if (name.length() > 60) name = name.substring(0, 60).trim();
        return name;
    }
}
