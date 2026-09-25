  async function onTicketFile(file: File) {
    if (ticketBusy.current) return;
    if (!freightMode) return toast.error("Escolha primeiro o modo da viagem.");
    if (!ticketAccess?.authenticated) return toast.error("Entre com seu login para ler a foto.");
    ticketBusy.current = true;
    setTicketReading(true);
    setTicketData(null);
    setTicketImage(null);
    setTicketReadError("");
    setTicketConfirmed(false);
    setTons("");
    setTicketFileName(file.name);
    try {
      const imageData = await ticketImageToDataUrl(file);
      const dados = await lerTicket(
        imageData,
        freightMode,
        fleet ? { tractorPlate: fleet.tractorPlate, trailerPlate: fleet.trailerPlate } : undefined,
        file.name,
      );
      setTicketData(dados);
      setTicketImage(imageData);
      if (freightMode === "ton" && dados.peso_liquido_kg != null && dados.peso_liquido_kg > 0) {
        setTons(new Intl.NumberFormat("pt-BR", {
          minimumFractionDigits: 3,
          maximumFractionDigits: 3,
        }).format(dados.peso_liquido_kg / 1000));
      } else if (freightMode !== "ton") {
        setTons("");
      }
      if (dados.campos_ausentes?.length) toast.warning("Leitura incompleta. Preencha os campos que faltam antes de lançar.");
      else if (dados.alertas?.length) toast.warning("Ticket lido. Confira os alertas antes de lançar.");
      else toast.success("Ticket lido. Confira os dados antes de lançar.");
    } catch (error) {
      setTicketData(null);
      setTicketImage(null);
      const message = error instanceof Error ? error.message : "Não foi possível ler o ticket.";
      setTicketReadError(message);
      toast.error(message);
    } finally {
      ticketBusy.current = false;
      setTicketReading(false);
    }
  }

