package br.com.motoristaseguro.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;

public class LocationForegroundService extends Service implements LocationListener {
    public static final String ACTION_LOCATION = "br.com.motoristaseguro.app.LOCATION_UPDATE";
    public static final String PREFS = "tsv_location";
    private static final String CHANNEL_ID = "tsv_location_channel";
    private static final int NOTIFICATION_ID = 77;
    private LocationManager locationManager;

    @Override public void onCreate() {
        super.onCreate();
        createChannel();
        startForeground(NOTIFICATION_ID, buildNotification("Obtendo localização exata…"));
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        startLocationUpdates();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Localização em tempo real",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Mantém o GPS ativo enquanto Cliente ou Motorista está conectado.");
            NotificationManager manager = getSystemService(NotificationManager.class);
            manager.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification(String text) {
        Intent open = new Intent(this, MainActivity.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pending = PendingIntent.getActivity(this, 0, open, flags);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);
        return builder
            .setContentTitle("Transporte Seguro Vix • GPS ativo")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setContentIntent(pending)
            .build();
    }

    private void startLocationUpdates() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) return;
        try {
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, this);
            }
        } catch (Exception ignored) {}
        try {
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 1500L, 0f, this);
            }
        } catch (Exception ignored) {}
        Location last = null;
        try { last = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER); } catch (Exception ignored) {}
        if (last == null) {
            try { last = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER); } catch (Exception ignored) {}
        }
        if (last != null) onLocationChanged(last);
    }

    @Override public void onLocationChanged(Location location) {
        if (location == null) return;
        SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
        float oldAccuracy = p.getFloat("accuracy", Float.MAX_VALUE);
        long oldTime = p.getLong("time", 0L);
        boolean newer = location.getTime() >= oldTime;
        boolean moreAccurate = location.hasAccuracy() && location.getAccuracy() <= oldAccuracy;
        if (!newer && !moreAccurate) return;

        p.edit()
            .putString("lat", Double.toString(location.getLatitude()))
            .putString("lng", Double.toString(location.getLongitude()))
            .putFloat("accuracy", location.hasAccuracy() ? location.getAccuracy() : 0f)
            .putLong("time", System.currentTimeMillis())
            .apply();

        String msg = String.format("Precisão aproximada: ±%.0f m", location.hasAccuracy() ? location.getAccuracy() : 0f);
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.notify(NOTIFICATION_ID, buildNotification(msg));

        Intent i = new Intent(ACTION_LOCATION);
        i.setPackage(getPackageName());
        i.putExtra("lat", location.getLatitude());
        i.putExtra("lng", location.getLongitude());
        i.putExtra("accuracy", location.hasAccuracy() ? location.getAccuracy() : 0f);
        sendBroadcast(i);
    }

    @Override public void onProviderEnabled(String provider) {}
    @Override public void onProviderDisabled(String provider) {}
    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        startLocationUpdates();
        return START_STICKY;
    }

    @Override public void onDestroy() {
        if (locationManager != null) {
            try { locationManager.removeUpdates(this); } catch (Exception ignored) {}
        }
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
