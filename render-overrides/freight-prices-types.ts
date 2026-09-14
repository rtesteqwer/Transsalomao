export type EntityStatus = "ativo" | "inativo";

export type FreightMode = "ton" | "trip" | "cegonha" | "caixinha";
export type TripBillingType = "weight" | "fixed";

export type ExpenseAssetType = "tractor" | "trailer";

export type FreightPrices = {
  cegonha: number;
  caixinha: number;
};

export type Driver = {
  id: string;
  name: string;
  phone: string;
  category: string;
  status: EntityStatus;
  /** Fraction, e.g. 0.12 for 12%. */
  commissionPct: number;
};

export type Fleet = {
  id: string;
  name: string;
  tractorPlate: string;
  trailerPlate: string;
  model: string;
  status: EntityStatus;
};

export type Trip = {
  id: string;
  code: string;
  date: string;
  client: string;
  origin: string;
  destination: string;
  driverId: string;
  fleetId: string;
  loadedTons: number;
  grossWeight: number;
  netWeight: number;
  freightMode: FreightMode;
  tripBillingType: TripBillingType;
  pricePerTon: number;
  pricePerTrip: number;
  kmStart: number;
  kmEnd: number;
  dieselLiters: number;
  dieselPrice: number;
};

export type ReportStatus = "pendente" | "aceito" | "recusado";

export type DriverReport = {
  id: string;
  ticket: string;
  driverId: string;
  fleetId: string;
  km: number;
  tons: number;
  freightMode: FreightMode | null;
  status: ReportStatus;
  createdAt: string;
  tripId: string | null;
};

export type Expense = {
  id: string;
  date: string;
  fleetId: string;
  assetType: ExpenseAssetType;
  category: string;
  description: string;
  amount: number;
  notes: string;
  createdAt: string;
};

export type Fueling = {
  id: string;
  date: string;
  driverId: string | null;
  fleetId: string;
  station: string;
  km: number;
  liters: number;
  pricePerLiter: number;
  notes: string;
  createdAt: string;
};

export type PeriodKey = "7d" | "30d" | "month" | "all";

export type TripMetrics = {
  freight: number;
  kmDriven: number;
  kmPerLiter: number | null;
  dieselCost: number;
  grossResult: number;
  commissionPct: number;
  commissionValue: number;
  afterCommission: number;
};

export type ComputedTrip = Trip &
  TripMetrics & {
    driverName: string;
    fleetName: string;
    tractorPlate: string;
    trailerPlate: string;
  };

export type DriverTotals = {
  driverId: string;
  driverName: string;
  tripCount: number;
  tonTripCount: number;
  tonTons: number;
  tonFreight: number;
  tripModeCount: number;
  tripFreight: number;
  cegonhaCount: number;
  cegonhaFreight: number;
  caixinhaCount: number;
  caixinhaFreight: number;
  fixedTripCount: number;
  fixedFreight: number;
  totalKm: number;
  netWeight: number;
  avgPricePerTon: number | null;
  netTimesPrice: number;
  freight: number;
  commissionPct: number;
  commissionValue: number;
  freightAfterCommission: number;
  dieselLiters: number;
  kmPerLiter: number | null;
};

export type FleetTotals = {
  fleetId: string;
  fleetName: string;
  tractorPlate: string;
  trailerPlate: string;
  tripCount: number;
  tonTripCount: number;
  tonTons: number;
  tonFreight: number;
  tripModeCount: number;
  tripFreight: number;
  cegonhaCount: number;
  cegonhaFreight: number;
  caixinhaCount: number;
  caixinhaFreight: number;
  fixedTripCount: number;
  fixedFreight: number;
  totalKm: number;
  netWeight: number;
  avgPricePerTon: number | null;
  netTimesPrice: number;
  freight: number;
  dieselLiters: number;
  kmPerLiter: number | null;
};

export type DashboardKpis = {
  tripCount: number;
  tonTripCount: number;
  tonTons: number;
  tonFreight: number;
  tripModeCount: number;
  tripFreight: number;
  cegonhaCount: number;
  cegonhaFreight: number;
  caixinhaCount: number;
  caixinhaFreight: number;
  fixedTripCount: number;
  fixedFreight: number;
  totalKm: number;
  loadedTons: number;
  grossWeight: number;
  netWeight: number;
  revenue: number;
  dieselLiters: number;
  dieselCost: number;
  commissions: number;
  grossResult: number;
  afterCommission: number;
  avgKmL: number | null;
  avgPerTon: number | null;
};

export type FleetState = {
  drivers: Driver[];
  fleets: Fleet[];
  trips: Trip[];
  reports: DriverReport[];
  fuelings: Fueling[];
  expenses: Expense[];
  freightPrices: FreightPrices;
};
