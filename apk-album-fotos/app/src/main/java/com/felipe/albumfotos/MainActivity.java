package com.felipe.albumfotos;

import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {
    private AlbumAdapter adapter;
    private TextView txtEmpty;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        int p = dp(20);
        root.setPadding(p, dp(24), p, dp(16));

        TextView title = new TextView(this);
        title.setText("Meus álbuns");
        title.setTextColor(Color.rgb(17,17,17));
        title.setTextSize(28);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        root.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText("Crie um álbum e tire várias fotos direto nele.");
        subtitle.setTextColor(Color.GRAY);
        subtitle.setTextSize(15);
        LinearLayout.LayoutParams subLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        subLp.topMargin = dp(6);
        root.addView(subtitle, subLp);

        Button create = new Button(this);
        create.setText("+ Criar novo álbum");
        create.setAllCaps(false);
        create.setTextSize(17);
        LinearLayout.LayoutParams createLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(58));
        createLp.topMargin = dp(20);
        root.addView(create, createLp);

        txtEmpty = new TextView(this);
        txtEmpty.setText("Nenhum álbum ainda.");
        txtEmpty.setGravity(Gravity.CENTER);
        txtEmpty.setTextColor(Color.GRAY);
        txtEmpty.setTextSize(16);
        LinearLayout.LayoutParams emptyLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        emptyLp.topMargin = dp(28);
        root.addView(txtEmpty, emptyLp);

        RecyclerView recycler = new RecyclerView(this);
        recycler.setLayoutManager(new LinearLayoutManager(this));
        adapter = new AlbumAdapter(this::openAlbumCamera);
        recycler.setAdapter(adapter);
        LinearLayout.LayoutParams listLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        listLp.topMargin = dp(16);
        root.addView(recycler, listLp);

        setContentView(root);
        create.setOnClickListener(v -> showCreateAlbumDialog());
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshAlbums();
    }

    private void showCreateAlbumDialog() {
        final EditText input = new EditText(this);
        input.setHint("Ex.: Viagem 05-10-2026");
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        int p = dp(20);
        input.setPadding(p, dp(8), p, dp(8));

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Nome do álbum")
                .setMessage("As fotos serão salvas em Pictures/AlbunsFotos/Nome do álbum.")
                .setView(input)
                .setNegativeButton("Cancelar", null)
                .setPositiveButton("Criar e abrir câmera", null)
                .create();

        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String name = AlbumStore.sanitizeAlbumName(input.getText().toString());
            if (name.isEmpty()) {
                input.setError("Digite um nome para o álbum");
                return;
            }
            AlbumStore.addAlbum(this, name);
            dialog.dismiss();
            openAlbumCamera(name);
        }));
        dialog.show();
    }

    private void openAlbumCamera(String albumName) {
        Intent i = new Intent(this, CameraActivity.class);
        i.putExtra(CameraActivity.EXTRA_ALBUM_NAME, albumName);
        startActivity(i);
    }

    private void refreshAlbums() {
        List<String> names = AlbumStore.getAlbums(this);
        List<AlbumAdapter.AlbumItem> values = new ArrayList<>();
        for (String name : names) values.add(new AlbumAdapter.AlbumItem(name, countPhotos(name)));
        adapter.setItems(values);
        txtEmpty.setVisibility(values.isEmpty() ? View.VISIBLE : View.GONE);
    }

    private int countPhotos(String albumName) {
        String relativePath = "Pictures/AlbunsFotos/" + albumName + "/";
        Uri collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        String[] projection = { MediaStore.Images.Media._ID };
        String selection = MediaStore.Images.Media.RELATIVE_PATH + "=?";
        String[] args = { relativePath };
        try (Cursor cursor = getContentResolver().query(collection, projection, selection, args, null)) {
            return cursor == null ? 0 : cursor.getCount();
        } catch (Exception ignored) {
            return 0;
        }
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }
}
