    try {
      const count = batchMode ? tripCountN : 1;
      let firstTicket = "";

      if (freightMode === "ton" && ticketData) {
        if (!ticketData.numero_ticket?.trim()) return toast.error("Confira o número do ticket.");
        if (!(ticketData.peso_liquido_kg != null && ticketData.peso_liquido_kg > 0)) {
          return toast.error("Confira o peso líquido do ticket.");
        }
        const saved = await salvarTicket({
          ...ticketData,
          driverId,
          fleetId,
          km_carreta: Number.parseInt(kmCarreta.replace(/\D/g, ""), 10) || 0,
        });
        firstTicket = saved.ticket;
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
      setSentTicket(count > 1 ? firstTicket + " + " + (count - 1) + " viagem(ns)" : firstTicket);
      setTons("");
      setDailyValue("");
      setTicketData(null);
      setTicketFileName("");
      setKmCarreta("");
      if (batchMode) setTripCount("1");
      toast.success(count > 1
        ? count + " viagens enviadas ao Painel Gerência."
        : "Ticket " + firstTicket + " enviado ao Painel Gerência.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível enviar.");
    }
