  async function onTicketFile(file: File) {
    if (ticketBusy.current) return;
    if (freightMode !== "ton") setFreightMode("ton");
    if (!ticketAccess?.authenticated) return toast.error("Entre com seu login para ler a foto.");
    ticketBusy.current = true;
    setTicketReading(true);
    setTicketData(null);
    setTicketConfirmed(false);
    setTons("");
    setTicketFileName(file.name);
    try {
      const dados = await lerTicket(file);
      setTicketData(dados);
      if (dados.peso_liquido_kg != null && dados.peso_liquido_kg > 0) {
        setTons(new Intl.NumberFormat("pt-BR", {
          minimumFractionDigits: 3,
          maximumFractionDigits: 3,
        }).format(dados.peso_liquido_kg / 1000));
      }
      if (dados.alertas?.length) toast.warning("Ticket lido. Confira os alertas antes de lançar.");
      else toast.success("Ticket lido. Confira os dados antes de lançar.");
    } catch (error) {
      setTicketData(null);
      toast.error(error instanceof Error ? error.message : "Não foi possível ler o ticket.");
    } finally {
      ticketBusy.current = false;
      setTicketReading(false);
    }
  }

