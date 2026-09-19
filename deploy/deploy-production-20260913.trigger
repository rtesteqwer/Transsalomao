deploy requested 2026-09-19 ticket collision integrity + fueling driver report fix
changes: next automatic ticket now uses the highest numeric trip/report ticket plus one; accepting a pending report can no longer reuse an older trip when a ticket collides and instead assigns a new safe ticket; PDF fuelings resolve driver names through driver_id fallback when driverName is absent
recovery: preserve every existing trip; restore the seven 2026-09-19 cegonha launches as new trips after production fix is live, without deleting or overwriting historical trips
validation: collision patch reconstructed from clean production source and rechecked before deploy
publish same Vercel project: transsalomao
