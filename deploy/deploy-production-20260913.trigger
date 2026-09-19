deploy requested 2026-09-19 ticket collision integrity + fueling driver report fix
changes: next automatic ticket now uses the highest numeric trip/report ticket plus one; accepting a pending report can no longer reuse an older trip when a ticket collides and instead assigns a new safe ticket; PDF fuelings resolve driver names through driver_id fallback when driverName is absent
recovery: preserve every existing trip; restore the seven 2026-09-19 cegonha launches as new trips after production fix is live, without deleting or overwriting historical trips
validation: minimal production fix retained: automatic ticket uses highest existing numeric code; acceptance patch restored to last known-good source
publish same Vercel project: transsalomao
