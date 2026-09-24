          <section className="grid gap-4 rounded-xl border border-border bg-surface p-4">
              <div>
                <p className="text-sm font-semibold">Foto do ticket / documento da viagem</p>
                <p className="mt-1 text-xs text-muted">
                  {freightMode === "ton"
                    ? "A IA lê número do ticket, peso líquido, placas, transportadora e destinatário."
                    : "Neste modo a IA guarda número do ticket, placas, transportadora e destinatário; pesos e pesagens são ignorados."}
                </p>
              </div>

              {!freightMode ? (
                <p className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-muted">
                  Escolha o modo da viagem antes de enviar a foto.
                </p>
              ) : null}
              <TicketPhotoAccess onAccess={setTicketAccess} />
              <div className="grid grid-cols-2 gap-3">
                {[{ label: "Tirar foto", camera: true }, { label: "Escolher da galeria", camera: false }].map(option => (
                  <label key={option.label} className="relative flex min-h-28 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-bg px-3 py-4 text-center">
                    {ticketReading ? <LoaderCircle className="size-6 animate-spin text-accent" /> : <Camera className="size-6 text-accent" />}
                    <strong className="mt-2 text-sm">{ticketReading ? "Lendo ticket…" : option.label}</strong>
                    <input className="absolute inset-0 h-full w-full cursor-pointer opacity-0" type="file" aria-label={option.label} accept="image/*" capture={option.camera ? "environment" : undefined}
                      disabled={ticketReading || ticketSending || !freightMode || !ticketAccess?.authenticated || !ticketAccess.available}
                      onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void onTicketFile(file); }} />
                  </label>
                ))}
              </div>
              {ticketFileName ? <p className="break-all text-xs text-muted" role="status">{ticketFileName}</p> : null}
              {ticketFileName && !ticketData && !ticketReading ? (
                <div className="grid gap-2 rounded-lg border border-warn/30 bg-warn/10 p-3 text-xs text-muted">
                  <p className="font-medium text-fg">A foto foi selecionada, mas a leitura não foi concluída.</p>
                  {ticketReadError ? <p role="alert" className="text-danger">{ticketReadError}</p> : null}
                  <p>O sistema não enviará um ticket automático sem os dados da foto.</p>
                  <Button type="button" variant="ghost" onClick={() => { setTicketFileName(""); setTicketReadError(""); setTicketConfirmed(false); }}>
                    Remover foto e lançar manualmente
                  </Button>
                </div>
              ) : null}

              {ticketData ? (
                <div className="grid gap-3 rounded-xl border border-border bg-bg p-4">
                  <Field label="Número do ticket" hint="Confira com a foto">
                    <Input
                      value={ticketData.numero_ticket ?? ""}
                      onChange={(event) => { setTicketConfirmed(false); setTicketData({ ...ticketData, numero_ticket: event.target.value.toUpperCase() || null }); }}
                      autoCapitalize="characters"
                      className="h-12 font-display text-xl"
                    />
                  </Field>

                  {freightMode === "ton" ? (
                    <Field label="Peso líquido (kg)" hint="Usado somente no modo Por tonelada">
                      <Input
                        value={ticketData.peso_liquido_kg ?? ""}
                        inputMode="numeric"
                        onChange={(event) => {
                          setTicketConfirmed(false);
                          const raw = event.target.value.replace(/\D/g, "");
                          const kg = raw ? Number(raw) : null;
                          setTicketData({ ...ticketData, peso_liquido_kg: kg });
                          if (kg != null && kg > 0) {
                            setTons(new Intl.NumberFormat("pt-BR", {
                              minimumFractionDigits: 3,
                              maximumFractionDigits: 3,
                            }).format(kg / 1000));
                          } else { setTons(""); }
                        }}
                        className="h-12 font-display text-xl"
                      />
                    </Field>
                  ) : null}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Placa do veículo" hint="Prioritário">
                      <Input
                        value={ticketData.placa_veiculo ?? ""}
                        onChange={(event) => { setTicketConfirmed(false); setTicketData({ ...ticketData, placa_veiculo: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") || null }); }}
                        autoCapitalize="characters"
                      />
                    </Field>
                    <Field label="Placa da carreta" hint="Prioritário">
                      <Input
                        value={ticketData.placa_carreta ?? ""}
                        onChange={(event) => { setTicketConfirmed(false); setTicketData({ ...ticketData, placa_carreta: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") || null }); }}
                        autoCapitalize="characters"
                      />
                    </Field>
                    <Field label="Transportadora" hint="Empresa que transporta">
                      <Input value={ticketData.transportadora ?? ""} onChange={(event) => { setTicketConfirmed(false); setTicketData({ ...ticketData, transportadora: event.target.value || null }); }} />
                    </Field>
                    <Field label="Operadora" hint="Terminal / porto / operação">
                      <Input value={ticketData.operadora ?? ""} onChange={(event) => { setTicketConfirmed(false); setTicketData({ ...ticketData, operadora: event.target.value || null }); }} />
                    </Field>
                    <Field label="Empresa contratante" hint="Contratante / tomadora">
                      <Input value={ticketData.contratante ?? ""} onChange={(event) => { setTicketConfirmed(false); setTicketData({ ...ticketData, contratante: event.target.value || null }); }} />
                    </Field>
                    <Field label="Destinatário / recebedor" hint="Quem receberá a carga">
                      <Input value={ticketData.destinatario ?? ticketData.cliente ?? ""} onChange={(event) => { setTicketConfirmed(false); setTicketData({ ...ticketData, destinatario: event.target.value || null }); }} />
                    </Field>
                    <div className="text-xs text-muted">Produto: <b className="text-fg">{ticketData.produto || "—"}</b></div>
                    <div className="text-xs text-muted">NF: <b className="text-fg">{ticketData.numero_nf || "—"}</b></div>
                  </div>

                  {ticketData.alertas?.length ? (
                    <div className="rounded-lg border border-warn/30 bg-warn/10 p-3">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <AlertTriangle className="size-4 text-warn" /> Confira antes de lançar
                      </div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
                        {ticketData.alertas.map((alerta, index) => <li key={index}>{alerta}</li>)}
                      </ul>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-sm">
                      <CheckCircle2 className="size-4 text-ok" /> Leitura sem alertas automáticos.
                    </div>
                  )}

                  {fleet && ((ticketData.placa_veiculo && ticketData.placa_veiculo !== fleet.tractorPlate.replace(/[^a-z0-9]/gi, "").toUpperCase()) || (ticketData.placa_carreta && ticketData.placa_carreta !== fleet.trailerPlate.replace(/[^a-z0-9]/gi, "").toUpperCase())) ? <p role="alert" className="text-sm text-warn">A placa lida difere do conjunto selecionado. Confira a foto e o conjunto.</p> : null}
                  <label className="flex items-start gap-3 text-sm">
                    <input type="checkbox" className="mt-1 size-5" checked={ticketConfirmed} onChange={event => setTicketConfirmed(event.target.checked)} />
                    {freightMode === "ton"
                      ? "Conferi o número, o peso líquido, as placas, a transportadora, a operadora/contratante e o destinatário."
                      : "Conferi o número, as placas, a transportadora, a operadora/contratante e o destinatário. Nenhum peso será gravado neste modo."}
                  </label>
                  <Button type="button" variant="ghost" onClick={() => { setTicketData(null); setTicketFileName(""); setTicketReadError(""); setTicketConfirmed(false); setTons(""); }}>
                    Descartar leitura
                  </Button>
                </div>
              ) : null}
            </section>

