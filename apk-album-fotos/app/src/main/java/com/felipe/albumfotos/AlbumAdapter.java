package com.felipe.albumfotos;

import android.graphics.Color;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;
import java.util.List;

public class AlbumAdapter extends RecyclerView.Adapter<AlbumAdapter.Holder> {
    public interface Listener { void onAlbumClick(String albumName); }

    public static class AlbumItem {
        final String name;
        final int count;
        AlbumItem(String name, int count) { this.name = name; this.count = count; }
    }

    private final List<AlbumItem> items = new ArrayList<>();
    private final Listener listener;

    public AlbumAdapter(Listener listener) { this.listener = listener; }

    public void setItems(List<AlbumItem> values) {
        items.clear();
        items.addAll(values);
        notifyDataSetChanged();
    }

    @NonNull @Override
    public Holder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        LinearLayout row = new LinearLayout(parent.getContext());
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        int p = dp(parent, 16);
        row.setPadding(p, p, p, p);
        RecyclerView.LayoutParams lp = new RecyclerView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(parent, 84));
        lp.setMargins(0, 0, 0, dp(parent, 10));
        row.setLayoutParams(lp);
        row.setBackgroundColor(Color.rgb(246, 246, 246));

        TextView icon = new TextView(parent.getContext());
        icon.setText("📷");
        icon.setTextSize(28);
        icon.setGravity(Gravity.CENTER);
        row.addView(icon, new LinearLayout.LayoutParams(dp(parent, 54), dp(parent, 54)));

        LinearLayout textBox = new LinearLayout(parent.getContext());
        textBox.setOrientation(LinearLayout.VERTICAL);
        textBox.setPadding(dp(parent, 10), 0, 0, 0);

        TextView name = new TextView(parent.getContext());
        name.setTextSize(18);
        name.setTextColor(Color.rgb(20,20,20));
        name.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        textBox.addView(name);

        TextView count = new TextView(parent.getContext());
        count.setTextSize(14);
        count.setTextColor(Color.rgb(100,100,100));
        textBox.addView(count);

        row.addView(textBox, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView arrow = new TextView(parent.getContext());
        arrow.setText("›");
        arrow.setTextSize(32);
        arrow.setTextColor(Color.GRAY);
        row.addView(arrow);

        return new Holder(row, name, count);
    }

    @Override
    public void onBindViewHolder(@NonNull Holder h, int position) {
        AlbumItem item = items.get(position);
        h.name.setText(item.name);
        h.count.setText(item.count == 1 ? "1 foto" : item.count + " fotos");
        h.itemView.setOnClickListener(v -> listener.onAlbumClick(item.name));
    }

    @Override public int getItemCount() { return items.size(); }

    static class Holder extends RecyclerView.ViewHolder {
        final TextView name, count;
        Holder(@NonNull LinearLayout itemView, TextView name, TextView count) {
            super(itemView);
            this.name = name;
            this.count = count;
        }
    }

    private static int dp(ViewGroup v, int value) {
        return (int) (value * v.getResources().getDisplayMetrics().density + 0.5f);
    }
}
