from pathlib import Path

path = Path('app/src/main/java/br/com/motoristaseguro/app/MainActivity.java')
s = path.read_text(encoding='utf-8')

old = '''    private void searchDestinations(String query, LinearLayout suggestions, TextView status){
        new Thread(()->{
            List<PlaceSuggestion> found=new ArrayList<>();
            try{
                StringBuilder u=new StringBuilder("https://photon.komoot.io/api/?limit=6&lang=pt&q=").append(URLEncoder.encode(query,"UTF-8"));
                if(!Double.isNaN(lastLat)&&!Double.isNaN(lastLng))u.append("&lat=").append(lastLat).append("&lon=").append(lastLng);
                HttpURLConnection c=(HttpURLConnection)new URL(u.toString()).openConnection();c.setConnectTimeout(7000);c.setReadTimeout(7000);c.setRequestProperty("User-Agent","TransporteSeguroVix/2.5 Android");
                BufferedReader br=new BufferedReader(new InputStreamReader(c.getInputStream()));StringBuilder raw=new StringBuilder();String line;while((line=br.readLine())!=null)raw.append(line);br.close();
                JSONArray features=new JSONObject(raw.toString()).optJSONArray("features");Set<String> seen=new LinkedHashSet<>();
                if(features!=null)for(int i=0;i<features.length();i++){
                    JSONObject f=features.optJSONObject(i);if(f==null)continue;JSONObject props=f.optJSONObject("properties");JSONObject geo=f.optJSONObject("geometry");if(props==null||geo==null)continue;JSONArray coords=geo.optJSONArray("coordinates");if(coords==null||coords.length()<2)continue;
                    String label=placeLabel(props);if(label.isEmpty()||seen.contains(label))continue;seen.add(label);found.add(new PlaceSuggestion(label,coords.optDouble(1),coords.optDouble(0)));
                }
            }catch(Exception ignored){}
            runOnUiThread(()->renderSuggestions(found,suggestions,status));
        }).start();
    }
'''

new = '''    private void searchDestinations(String query, LinearLayout suggestions, TextView status){
        new Thread(()->{
            List<PlaceSuggestion> found=new ArrayList<>();
            final String[] error={null};

            // Primary search goes through our Vercel API. This lets us fix providers
            // server-side later without forcing every user to install a new APK.
            try{
                StringBuilder u=new StringBuilder("https://transportesegurovix.vercel.app/api/search?q=").append(URLEncoder.encode(query,"UTF-8"));
                if(!Double.isNaN(lastLat)&&!Double.isNaN(lastLng))u.append("&lat=").append(lastLat).append("&lon=").append(lastLng);
                HttpURLConnection c=(HttpURLConnection)new URL(u.toString()).openConnection();
                c.setConnectTimeout(8000);c.setReadTimeout(8000);
                c.setRequestProperty("User-Agent","TransporteSeguroVix/2.6 Android");
                c.setRequestProperty("Accept","application/json");
                int code=c.getResponseCode();
                if(code>=200&&code<300){
                    BufferedReader br=new BufferedReader(new InputStreamReader(c.getInputStream()));StringBuilder raw=new StringBuilder();String line;while((line=br.readLine())!=null)raw.append(line);br.close();
                    JSONArray results=new JSONObject(raw.toString()).optJSONArray("results");Set<String> seen=new LinkedHashSet<>();
                    if(results!=null)for(int i=0;i<results.length();i++){
                        JSONObject r=results.optJSONObject(i);if(r==null)continue;
                        String label=r.optString("label","").trim();double lat=r.optDouble("lat",Double.NaN),lng=r.optDouble("lng",Double.NaN);
                        if(label.isEmpty()||Double.isNaN(lat)||Double.isNaN(lng)||seen.contains(label))continue;
                        seen.add(label);found.add(new PlaceSuggestion(label,lat,lng));
                    }
                }else error[0]="Serviço de busca indisponível ("+code+")";
                c.disconnect();
            }catch(Exception ex){error[0]="Falha de conexão com a busca. Tentando rota alternativa…";}

            // Fallback: direct Photon search, intentionally without lang=pt.
            // Some Photon installations reject unsupported language parameters.
            if(found.isEmpty()){
                try{
                    String[] terms=new String[]{query,query+", Brasil"};
                    Set<String> seen=new LinkedHashSet<>();
                    for(String term:terms){
                        StringBuilder u=new StringBuilder("https://photon.komoot.io/api/?limit=8&q=").append(URLEncoder.encode(term,"UTF-8"));
                        if(term.equals(query)&&!Double.isNaN(lastLat)&&!Double.isNaN(lastLng))u.append("&lat=").append(lastLat).append("&lon=").append(lastLng).append("&location_bias_scale=0.65");
                        HttpURLConnection c=(HttpURLConnection)new URL(u.toString()).openConnection();
                        c.setConnectTimeout(7000);c.setReadTimeout(7000);
                        c.setRequestProperty("User-Agent","TransporteSeguroVix/2.6 Android");
                        c.setRequestProperty("Accept-Language","pt-BR,pt;q=0.9,en;q=0.7");
                        int code=c.getResponseCode();
                        if(code>=200&&code<300){
                            BufferedReader br=new BufferedReader(new InputStreamReader(c.getInputStream()));StringBuilder raw=new StringBuilder();String line;while((line=br.readLine())!=null)raw.append(line);br.close();
                            JSONArray features=new JSONObject(raw.toString()).optJSONArray("features");
                            if(features!=null)for(int i=0;i<features.length();i++){
                                JSONObject f=features.optJSONObject(i);if(f==null)continue;JSONObject props=f.optJSONObject("properties");JSONObject geo=f.optJSONObject("geometry");if(props==null||geo==null)continue;JSONArray coords=geo.optJSONArray("coordinates");if(coords==null||coords.length()<2)continue;
                                String label=placeLabel(props);double lat=coords.optDouble(1,Double.NaN),lng=coords.optDouble(0,Double.NaN);
                                if(label.isEmpty()||Double.isNaN(lat)||Double.isNaN(lng)||seen.contains(label))continue;
                                seen.add(label);found.add(new PlaceSuggestion(label,lat,lng));if(found.size()>=8)break;
                            }
                        }
                        c.disconnect();
                        if(!found.isEmpty())break;
                    }
                    if(!found.isEmpty())error[0]=null;
                }catch(Exception ex){if(error[0]==null)error[0]="Não foi possível consultar destinos. Verifique sua internet.";}
            }

            runOnUiThread(()->{
                if(found.isEmpty()&&error[0]!=null){suggestions.removeAllViews();status.setText(error[0]);return;}
                renderSuggestions(found,suggestions,status);
            });
        }).start();
    }
'''

if old not in s:
    raise SystemExit('Expected v2.5 searchDestinations block not found')

s = s.replace(old, new)
s = s.replace('searchHandler.postDelayed(pendingSearch,450)', 'searchHandler.postDelayed(pendingSearch,650)')
s = s.replace('v2.5 • busca de destino com sugestões', 'v2.6 • busca de destino corrigida')
s = s.replace('Painel operacional de teste • v2.5', 'Painel operacional de teste • v2.6')
path.write_text(s, encoding='utf-8')
print('MainActivity patched for v2.6 destination search')
