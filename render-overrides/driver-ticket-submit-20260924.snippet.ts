    if (ticketBusy.current) return;
    if (ticketFileName && !ticketData) return toast.error("A foto foi selecionada, mas não foi lida. Tente ler novamente ou remova a foto para lançar manualmente.");
    if (ticketData && !ticketImage) return toast.error("A foto foi lida, mas não ficou pronta para arquivamento. Selecione a foto novamente.");
    if (ticketData && !ticketConfirmed) return toast.error("Confirme a conferência dos dados do ticket.");
    ticketBusy.current = true;
    setTicketSending(true);
    try {
      const count = batchMode ? tripCountN : 1;
      let firstTicket = "";
      let sentCount = count;

      if (ticketData) {
        if (count > 1) return toast.error("Com foto do ticket, envie uma viagem por vez para manter cada ticket ligado à viagem correta.");
        if (!ticketData.numero_ticket?.trim()) return toast.error("Confira o número do ticket.");
        if (freightMode === "ton" && !(ticketData.peso_liquido_kg != null && ticketData.peso_liquido_kg > 0)) {
          return toast.error("Confira o peso líquido do ticket.");
        }
        const saved = await salvarTicket({
          ...ticketData,
          conferido: true,
          driverId,
          fleetId,
          freightMode,
          dailyValue: freightMode === "trip" ? (dailyValueN ?? 0) : 0,
          km_carreta: Number.parseInt(kmCarreta.replace(/\D/g, ""), 10) || 0,
          imagem: ticketImage ?? undefined,
          fileName: ticketFileName || "ticket.jpg",
        });
        firstTicket = saved.ticket;
        sentCount = 1;
      } else {
        for (let index = 0; index < count; index += 1) {
          const res = await report.mutateAsync({
            ticket: "",
            driverId,
            fleetId,
            km: 0,
            tons: batchMode || freightMode === "trip" ? 0 : (tonsN ?? 0),
            dailyValue: freightMode === "trip" ? (dailyValueN ?? 0) : 0,
            freightMode,
          });
          if (!firstTicket) firstTicket = res.ticket;
        }
      }

      localStorage.setItem(DRIVER_KEY, driverId);
      localStorage.setItem(FLEET_KEY, fleetId);
      localStorage.setItem(MODE_KEY, freightMode);
      setSentTicket(sentCount > 1 ? firstTicket + " + " + (sentCount - 1) + " viagem(ns)" : firstTicket);
      setTons("");
      setDailyValue("");
      setTicketData(null);
      setTicketImage(null);
      setTicketConfirmed(false);
      await queryClient.invalidateQueries({ queryKey: fleetKey });
      setTicketFileName("");
      setKmCarreta("");
      if (batchMode) setTripCount("1");
      toast.success(sentCount > 1
        ? sentCount + " viagens enviadas ao Caixa da Gerência."
        : "Ticket " + firstTicket + " enviado ao Caixa da Gerência.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível enviar.");
    } finally {
      ticketBusy.current = false;
      setTicketSending(false);
    }
