package com.felipe.albumfotos;

import android.Manifest;
import android.content.ContentValues;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;

import com.google.common.util.concurrent.ListenableFuture;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class CameraActivity extends AppCompatActivity {
    public static final String EXTRA_ALBUM_NAME = "album_name";

    private PreviewView previewView;
    private Button shutter;
    private TextView counter;
    private ImageCapture imageCapture;
    private ProcessCameraProvider cameraProvider;
    private ExecutorService cameraExecutor;
    private String albumName;
    private int currentLens = CameraSelector.LENS_FACING_BACK;
    private int sessionPhotoCount = 0;
    private boolean saving = false;

    private final ActivityResultLauncher<String> cameraPermissionLauncher =
            registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
                if (granted) startCamera();
                else {
                    Toast.makeText(this, "A câmera precisa de permissão para funcionar.", Toast.LENGTH_LONG).show();
                    finish();
                }
            });

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        albumName = AlbumStore.sanitizeAlbumName(getIntent().getStringExtra(EXTRA_ALBUM_NAME));
        if (albumName.isEmpty()) {
            finish();
            return;
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        previewView = new PreviewView(this);
        root.addView(previewView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.VERTICAL);
        top.setGravity(Gravity.CENTER);
        top.setPadding(dp(16), dp(18), dp(16), dp(14));
        top.setBackgroundColor(0x66000000);

        TextView title = new TextView(this);
        title.setText(albumName);
        title.setTextColor(Color.WHITE);
        title.setTextSize(20);
        title.setGravity(Gravity.CENTER);
        top.addView(title);

        counter = new TextView(this);
        counter.setTextColor(0xFFDDDDDD);
        counter.setTextSize(14);
        counter.setGravity(Gravity.CENTER);
        top.addView(counter);
        updateCounter();

        FrameLayout.LayoutParams topLp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP);
        root.addView(top, topLp);

        LinearLayout bottom = new LinearLayout(this);
        bottom.setOrientation(LinearLayout.VERTICAL);
        bottom.setGravity(Gravity.CENTER);
        bottom.setPadding(dp(18), dp(14), dp(18), dp(22));
        bottom.setBackgroundColor(0x66000000);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);

        Button flip = new Button(this);
        flip.setText("Trocar câmera");
        flip.setAllCaps(false);
        actions.addView(flip, new LinearLayout.LayoutParams(0, dp(52), 1f));

        Button done = new Button(this);
        done.setText("Concluir");
        done.setAllCaps(false);
        LinearLayout.LayoutParams doneLp = new LinearLayout.LayoutParams(0, dp(52), 1f);
        doneLp.leftMargin = dp(12);
        actions.addView(done, doneLp);

        bottom.addView(actions, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        shutter = new Button(this);
        shutter.setText("●");
        shutter.setTextSize(42);
        shutter.setTextColor(Color.BLACK);
        shutter.setContentDescription("Tirar foto");
        LinearLayout.LayoutParams shutterLp = new LinearLayout.LayoutParams(dp(92), dp(92));
        shutterLp.topMargin = dp(18);
        bottom.addView(shutter, shutterLp);

        FrameLayout.LayoutParams bottomLp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        root.addView(bottom, bottomLp);

        setContentView(root);
        cameraExecutor = Executors.newSingleThreadExecutor();

        shutter.setOnClickListener(v -> takePhoto());
        done.setOnClickListener(v -> finish());
        flip.setOnClickListener(v -> {
            currentLens = currentLens == CameraSelector.LENS_FACING_BACK
                    ? CameraSelector.LENS_FACING_FRONT : CameraSelector.LENS_FACING_BACK;
            bindCameraUseCases();
        });

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startCamera();
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA);
        }
    }

    private void startCamera() {
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            try {
                cameraProvider = future.get();
                bindCameraUseCases();
            } catch (Exception e) {
                Toast.makeText(this, "Não foi possível abrir a câmera.", Toast.LENGTH_LONG).show();
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private void bindCameraUseCases() {
        if (cameraProvider == null) return;
        CameraSelector selector = new CameraSelector.Builder().requireLensFacing(currentLens).build();
        try {
            if (!cameraProvider.hasCamera(selector)) {
                currentLens = CameraSelector.LENS_FACING_BACK;
                selector = new CameraSelector.Builder().requireLensFacing(currentLens).build();
            }
            Preview preview = new Preview.Builder().build();
            preview.setSurfaceProvider(previewView.getSurfaceProvider());
            imageCapture = new ImageCapture.Builder()
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                    .build();

            cameraProvider.unbindAll();
            cameraProvider.bindToLifecycle(this, selector, preview, imageCapture);
        } catch (Exception e) {
            Toast.makeText(this, "Erro ao iniciar a câmera.", Toast.LENGTH_SHORT).show();
        }
    }

    private void takePhoto() {
        if (imageCapture == null || saving) return;
        saving = true;
        shutter.setEnabled(false);

        String stamp = new SimpleDateFormat("yyyyMMdd_HHmmss_SSS", Locale.US).format(new Date());
        String filename = "IMG_" + stamp + ".jpg";
        String relativePath = "Pictures/AlbunsFotos/" + albumName + "/";

        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, filename);
        values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
        values.put(MediaStore.Images.Media.RELATIVE_PATH, relativePath);

        ImageCapture.OutputFileOptions options = new ImageCapture.OutputFileOptions.Builder(
                getContentResolver(),
                MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY),
                values
        ).build();

        imageCapture.takePicture(options, cameraExecutor, new ImageCapture.OnImageSavedCallback() {
            @Override
            public void onImageSaved(@NonNull ImageCapture.OutputFileResults outputFileResults) {
                runOnUiThread(() -> {
                    sessionPhotoCount++;
                    updateCounter();
                    saving = false;
                    shutter.setEnabled(true);
                    Toast.makeText(CameraActivity.this, "Foto salva no álbum", Toast.LENGTH_SHORT).show();
                });
            }

            @Override
            public void onError(@NonNull ImageCaptureException exception) {
                runOnUiThread(() -> {
                    saving = false;
                    shutter.setEnabled(true);
                    Toast.makeText(CameraActivity.this, "Falha ao salvar a foto", Toast.LENGTH_SHORT).show();
                });
            }
        });
    }

    private void updateCounter() {
        if (counter == null) return;
        counter.setText(sessionPhotoCount == 1 ? "1 foto tirada agora" : sessionPhotoCount + " fotos tiradas agora");
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (cameraExecutor != null) cameraExecutor.shutdown();
    }
}
