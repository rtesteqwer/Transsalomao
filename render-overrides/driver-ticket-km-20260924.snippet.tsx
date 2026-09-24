          {freightMode === "ton" ? (
            <Field label="KM da carreta" hint="Opcional">
              <Input
                value={kmCarreta}
                onChange={(event) => setKmCarreta(event.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder={lastKm != null ? String(lastKm) : "0"}
                className="h-12 font-display text-xl tabular"
              />
            </Field>
          ) : null}

