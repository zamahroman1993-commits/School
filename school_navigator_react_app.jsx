import React, { useMemo, useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Upload, MapPin, Clock, Calendar, ZoomIn, ZoomOut, Crosshair, Save, User, Users } from "lucide-react";
import Papa from "papaparse";
import { motion } from "framer-motion";
import * as XLSX from "xlsx"; // sheetjs - include in your build deps

/**
 * School Navigator — Extended + Google OAuth
 * Added features in this version:
 * - Google sign-in (client-side, Google Identity Services)
 *   - Sign in with Google button and automatic role assignment based on email
 * - Admin fallback (password) still available for offline/demo use
 *
 * IMPORTANT:
 * - Create an OAuth 2.0 Client ID in Google Cloud Console (type: Web application)
 * - Add your app origin(s) and redirect URI(s) as required by Google
 * - Replace GOOGLE_CLIENT_ID below with your client ID or provide it via env at build time
 * - Configure ALLOWED_ADMINS (emails) to automatically grant admin role
 *
 * Notes for integration:
 * - Add `xlsx`, `papaparse`, `framer-motion`, `lucide-react`, `@/components/ui/*` and Tailwind to your project.
 * - The app stores all data in localStorage under key: `school_navigator_v1`.
 */

const STORAGE_KEY = "school_navigator_v1";

// ---- CONFIG: replace with your client id / admin emails or inject via env ----
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "REPLACE_WITH_GOOGLE_CLIENT_ID.apps.googleusercontent.com";
const ALLOWED_ADMINS = (process.env.NEXT_PUBLIC_SN_ADMINS || "admin@school.example.com").split(",").map(s=>s.trim()).filter(Boolean);
// ----------------------------------------------------------------------------

const demo = {
  floors: [
    { id: "1", name: "Перший поверх", map: null },
    { id: "2", name: "Другий поверх", map: null },
  ],
  rooms: [
    { id: "A101", name: "Інформатика", x: 22, y: 36, floor: "1" },
    { id: "A102", name: "Математика", x: 40, y: 28, floor: "1" },
    { id: "B201", name: "Українська", x: 68, y: 52, floor: "2" },
  ],
  schedule: [
    { day: "Mon", timeStart: "08:30", timeEnd: "09:15", subject: "Інформатика", roomId: "A101", teacher: "Іваненко" },
    { day: "Mon", timeStart: "09:25", timeEnd: "10:10", subject: "Математика", roomId: "A102", teacher: "Петренко" },
  ],
};

function saveToLocal(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
function loadFromLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(e);
    return null;
  }
}

function parseCSV(text) {
  const res = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
  if (res.errors?.length) console.warn(res.errors);
  return res.data;
}

// helper: decode JWT payload (no validation - for client-side display only)
function decodeJwtPayload(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(escape(decoded)));
  } catch (e) {
    return null;
  }
}

export default function SchoolNavigatorExtended() {
  // --- Data model ---
  const [data, setData] = useState(() => loadFromLocal() || demo);

  // user & role state
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sn_user')) || null; } catch(e){ return null; }
  });
  const [role, setRole] = useState(() => localStorage.getItem("sn_role") || "viewer");

  // role handling: simple admin with password stored in localStorage token (NOT secure, just basic for demo)
  function loginAdmin(password) {
    // change this password check to real auth for production
    if (password === "admin123") {
      localStorage.setItem("sn_role", "admin");
      setRole("admin");
      return true;
    }
    return false;
  }
  function logoutLocalAdmin() {
    localStorage.setItem("sn_role", "viewer");
    setRole("viewer");
  }

  // Google sign-in: signs user in and assigns role if email in ALLOWED_ADMINS
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.includes('REPLACE_WITH')) return;
    // load the Google Identity Services script
    const id = 'google-identity-js';
    if (document.getElementById(id)) return;
    const s = document.createElement('script');
    s.id = id;
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleCredentialResponse,
          auto_select: false,
        });
        // render button into container if exists
        const container = document.getElementById('g_id_signin');
        if (container) window.google.accounts.id.renderButton(container, { theme: 'outline', size: 'large' });
      }
    };
    document.head.appendChild(s);
    return () => { /* leave script for reuse */ };
  }, []);

  function handleCredentialResponse(response) {
    // response.credential is a JWT - decode payload to get user info
    const payload = decodeJwtPayload(response.credential);
    if (!payload) return alert('Не вдалося розпізнати облікові дані Google');
    const u = { id: payload.sub, email: payload.email, name: payload.name, picture: payload.picture };
    setUser(u);
    localStorage.setItem('sn_user', JSON.stringify(u));
    // assign role if email is in allowed list
    if (ALLOWED_ADMINS.includes(u.email)) {
      localStorage.setItem('sn_role', 'admin');
      setRole('admin');
    } else {
      localStorage.setItem('sn_role', 'viewer');
      setRole('viewer');
    }
  }

  function signOutGoogle() {
    // there is no full client-side sign-out for GSI token, but we can clear local state
    setUser(null);
    localStorage.removeItem('sn_user');
    // keep local role fallback
    logoutLocalAdmin();
    if (window.google && window.google.accounts && window.google.accounts.id) {
      try { window.google.accounts.id.disableAutoSelect(); } catch(e){}
    }
  }

  // --- UI state ---
  const [activeFloor, setActiveFloor] = useState(data.floors?.[0]?.id || "1");
  const [floorFiles, setFloorFiles] = useState({}); // {floorId: File}
  const floorUrls = useMemo(() => {
    const map = {};
    for (const f of data.floors || []) {
      const file = floorFiles[f.id];
      map[f.id] = file ? URL.createObjectURL(file) : f.map || null;
    }
    return map;
  }, [data.floors, floorFiles]);

  const [query, setQuery] = useState("");
  const [selectedRoom, setSelectedRoom] = useState(null);
  const mapRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [placingRoom, setPlacingRoom] = useState(null); // {id, floor}

  useEffect(() => saveToLocal(data), [data]);

  const roomsByFloor = useMemo(() => {
    const map = {};
    (data.rooms || []).forEach(r => { map[r.floor] = map[r.floor] || []; map[r.floor].push(r); });
    return map;
  }, [data.rooms]);

  const roomMap = useMemo(() => Object.fromEntries((data.rooms||[]).map(r=>[r.id,r])), [data.rooms]);

  // --- Import helpers ---
  function importRoomsCSV(text) {
    const raw = parseCSV(text);
    const rooms = raw.map(r => ({ id: (r.id||r.room||"").toString().trim(), name: (r.name||r.title||r.room||"").toString().trim(), x: Number(r.x), y: Number(r.y), floor: (r.floor||"1").toString() }));
    setData(d => ({ ...d, rooms: [...d.rooms.filter(rr=>!rooms.find(nr=>nr.id===rr.id)), ...rooms] }));
  }

  async function importExcel(file) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    // try to find sheets named 'rooms' and 'schedule'. fallback to first sheet as rooms
    const roomsSheet = wb.Sheets["rooms"] || wb.Sheets[wb.SheetNames[0]];
    const schedSheet = wb.Sheets["schedule"] || wb.Sheets[wb.SheetNames[1]];
    const roomsJson = XLSX.utils.sheet_to_json(roomsSheet);
    const schedJson = schedSheet ? XLSX.utils.sheet_to_json(schedSheet) : [];
    importRoomsCSV(XLSX.utils.sheet_to_csv(roomsSheet));
    if (schedJson.length) {
      const sched = schedJson.map(s=>({ day: s.day||s.Day||"", timeStart:s.timeStart||s.start||"", timeEnd:s.timeEnd||s.end||"", subject:s.subject||s.lesson||"", roomId:s.roomId||s.room||s.cabinet||"", teacher:s.teacher||"" }));
      setData(d=> ({...d, schedule: [...d.schedule.filter(ss=>!sched.find(nr=>nr.roomId===ss.roomId && nr.timeStart===ss.timeStart)), ...sched]}));
    }
  }

  // --- Map interactions ---
  function centerOnRoom(roomId) {
    const r = roomMap[roomId];
    if (!r || !mapRef.current) return;
    setSelectedRoom(r.id);
    const container = mapRef.current;
    const markerX = (r.x / 100) * container.scrollWidth;
    const markerY = (r.y / 100) * container.scrollHeight;
    container.scrollTo({ left: Math.max(0, markerX - container.clientWidth / 2), top: Math.max(0, markerY - container.clientHeight / 2), behavior: "smooth" });
  }

  function onMapClick(e) {
    if (!placingRoom) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * 100;
    const relY = ((e.clientY - rect.top) / rect.height) * 100;
    // save room
    setData(d => {
      const exists = (d.rooms||[]).find(r => r.id === placingRoom.id);
      let rooms = d.rooms ? [...d.rooms] : [];
      if (exists) {
        rooms = rooms.map(r => r.id === placingRoom.id ? { ...r, x: Number(relX.toFixed(2)), y: Number(relY.toFixed(2)), floor: placingRoom.floor } : r);
      } else {
        rooms.push({ id: placingRoom.id, name: placingRoom.name || placingRoom.id, x: Number(relX.toFixed(2)), y: Number(relY.toFixed(2)), floor: placingRoom.floor });
      }
      return { ...d, rooms };
    });
    setPlacingRoom(null);
  }

  // add floor
  function addFloor(name) {
    const id = Math.random().toString(36).slice(2,8);
    setData(d => ({ ...d, floors: [...d.floors, { id, name, map: null }] }));
    setActiveFloor(id);
  }

  // upload floor image
  function onFloorFile(floorId, file) {
    setFloorFiles(s => ({ ...s, [floorId]: file }));
    // we don't immediately write file to data.floors.map because files can't be serialized to localStorage; we keep object URL for session
  }

  // export/import JSON
  function exportJSON() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "school_navigator_export.json"; a.click(); URL.revokeObjectURL(url);
  }
  function importJSONFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try { const parsed = JSON.parse(e.target.result); setData(parsed); } catch(e){ alert("Невірний JSON") }
    };
    reader.readAsText(file);
  }

  // add/edit room via modal-like flow (simplified)
  function startPlaceRoom(roomId, floor) {
    setPlacingRoom({ id: roomId, floor });
    // instruct user to click map
  }

  // simple schedule import
  function importScheduleCSV(text) {
    const raw = parseCSV(text);
    const sched = raw.map(s => ({ day: (s.day||s.Day||"").toString(), timeStart: (s.timeStart||s.start||"").toString(), timeEnd: (s.timeEnd||s.end||"").toString(), subject: (s.subject||s.lesson||"").toString(), roomId: (s.roomId||s.room||s.cabinet||"").toString(), teacher: (s.teacher||"").toString() }));
    setData(d=>({ ...d, schedule: [...d.schedule.filter(ss=>!sched.find(nr=>nr.roomId===ss.roomId && nr.timeStart===ss.timeStart)), ...sched] }));
  }

  // UI helpers
  function addRoomManually(floor) {
    const id = prompt("ID кабінету (наприклад A103):");
    if (!id) return;
    const name = prompt("Назва кабінету (опціонально):") || id;
    startPlaceRoom(id, floor);
  }

  // Admin-only: delete room
  function deleteRoom(roomId) {
    if (role !== "admin") return alert("Тільки для адміністраторів");
    if (!confirm(`Видалити кабінет ${roomId}?`)) return;
    setData(d => ({ ...d, rooms: d.rooms.filter(r => r.id !== roomId) }));
  }

  // filtered lessons for active day and query
  const activeDay = useMemo(() => {
    const idx = new Date().getDay(); // 0=Sun
    return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][idx];
  }, []);

  const dayLessons = useMemo(() => {
    const q = query.toLowerCase();
    return (data.schedule||[]).filter(s => s.day === activeDay).filter(s => !q || s.subject.toLowerCase().includes(q) || (s.teacher||"").toLowerCase().includes(q) || (s.roomId||"").toLowerCase().includes(q)).sort((a,b)=>a.timeStart>b.timeStart?1:-1);
  }, [data.schedule, activeDay, query]);

  return (
    <div className="min-h-screen w-full bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">School Navigator — Extended</h1>
          <div className="flex items-center gap-2">
            {/* Google sign-in button container */}
            {user ? (
              <div className="flex items-center gap-2">
                <img src={user.picture} alt="avatar" className="w-8 h-8 rounded-full" />
                <div className="text-sm">{user.name} <div className="text-xs text-slate-500">{user.email}</div></div>
                <Button onClick={signOutGoogle}>Вийти</Button>
              </div>
            ) : (
              <div id="g_id_signin" />
            )}

            {role === "admin" ? (
              <button className="btn" onClick={logoutLocalAdmin}><User className="inline mr-2"/>Вихід (локальний)</button>
            ) : (
              <button className="btn" onClick={() => { const p = prompt("Пароль адміністратора:"); if (p) loginAdmin(p); }}><Users className="inline mr-2"/>Увійти як адмін</button>
            )}

            <Button variant="secondary" onClick={() => setZoom(z => Math.min(3, z * 1.2))}><ZoomIn className="h-4 w-4 mr-2" />Zoom</Button>
            <Button variant="secondary" onClick={() => setZoom(z => Math.max(0.5, z / 1.2))}><ZoomOut className="h-4 w-4 mr-2" />Zoom</Button>
            <Button variant="outline" onClick={() => selectedRoom && centerOnRoom(selectedRoom)}><Crosshair className="h-4 w-4 mr-2" />Center</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-1 space-y-4">
            <Card className="rounded-2xl">
              <CardHeader><CardTitle>Дані та імпорт</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm">Excel (.xlsx)</Label>
                    <Input type="file" accept=".xlsx,.xls" onChange={e => e.target.files?.[0] && importExcel(e.target.files[0])} />
                    <div className="text-xs text-slate-500">Шукаю листи named: rooms, schedule (або перший/другий лист)</div>
                  </div>

                  <div>
                    <Label className="text-sm">CSV — Кабінети</Label>
                    <textarea className="w-full min-h-[80px] rounded-xl border p-2 text-sm" placeholder="Вставте CSV з колонками id,name,x,y,floor" onBlur={e=>e.target.value && importRoomsCSV(e.target.value)} />
                  </div>

                  <div>
                    <Label className="text-sm">CSV — Розклад</Label>
                    <textarea className="w-full min-h-[100px] rounded-xl border p-2 text-sm" placeholder="Вставте CSV з колонками day,timeStart,timeEnd,subject,roomId,teacher" onBlur={e=>e.target.value && importScheduleCSV(e.target.value)} />
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={exportJSON}><Save className="mr-2"/>Експорт JSON</Button>
                    <Input type="file" accept="application/json" onChange={e => e.target.files?.[0] && importJSONFile(e.target.files[0])} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Полиці (Етажі)</CardTitle></CardHeader>
              <CardContent>
                <div className="flex gap-2 mb-3">
                  {data.floors.map(f => (
                    <button key={f.id} className={`px-3 py-1 rounded-xl ${activeFloor===f.id? 'bg-slate-800 text-white' : 'bg-white border'}`} onClick={()=>setActiveFloor(f.id)}>{f.name}</button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button onClick={()=>{ const name = prompt('Назва поверху:'); if(name) addFloor(name);}}>Додати поверх</Button>
                </div>

                <div className="mt-3">
                  <div className="text-xs text-slate-500">Завантажити зображення для поточного поверху</div>
                  <Input type="file" accept="image/*" onChange={e=> e.target.files?.[0] && onFloorFile(activeFloor, e.target.files[0])} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Керування кабінетами</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input type="text" placeholder="ID або назва для додавання" id="newRoomId" />
                    <Button onClick={()=>{ const el = document.getElementById('newRoomId'); if(!el) return; const v = el.value.trim(); if(!v) return alert('Введіть ID'); startPlaceRoom(v, activeFloor); el.value='';}}>Додати та поставити</Button>
                  </div>
                  <div className="text-xs text-slate-500">Клікніть "Додати та поставити", потім клікніть на карті, щоб встановити координати.</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Ролі</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2">
                  <div>Поточна роль: <b>{role}</b></div>
                  <div className="text-xs text-slate-500">Пароль адміністратора за замовчуванням: <code>admin123</code> (змініть у коді для продакшну).</div>
                  <div className="text-xs text-slate-500">Google OAuth client ID: <code>{GOOGLE_CLIENT_ID.includes('REPLACE')? 'не налаштовано' : 'налаштовано'}</code></div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Map + Rooms */}
          <div className="lg:col-span-3">
            <Card className="rounded-2xl">
              <CardHeader><CardTitle className="flex items-center gap-2"><MapPin/>Карта — {data.floors.find(f=>f.id===activeFloor)?.name}</CardTitle></CardHeader>
              <CardContent>
                <div ref={mapRef} onClick={onMapClick} className="relative w-full h-[620px] overflow-auto rounded-2xl border bg-white">
                  <div style={{ width: `${100*zoom}%`, height: `${100*zoom}%` }} className="relative">
                    {floorUrls[activeFloor] ? (
                      <img src={floorUrls[activeFloor]} alt="floor" className="w-full h-full object-contain select-none pointer-events-none" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">(Завантажте карту поверху або використайте демо)</div>
                    )}

                    {/* markers for this floor */}
                    {(roomsByFloor[activeFloor]||[]).map(r=> (
                      <div key={r.id} className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer`} style={{ left: `${r.x}%`, top: `${r.y}%` }} title={`${r.name} (${r.id})`} onClick={(e)=>{ e.stopPropagation(); setSelectedRoom(r.id); }} onDoubleClick={(e)=>{ e.stopPropagation(); centerOnRoom(r.id); }}>
                        <motion.div animate={{ scale: selectedRoom===r.id?1.05:1 }} className={`px-2 py-1 rounded-xl shadow ${selectedRoom===r.id ? 'bg-blue-600 text-white' : 'bg-white text-slate-900 border'}`}>
                          <div className="text-xs font-semibold flex items-center gap-1"><MapPin className="h-3 w-3"/> {r.id}</div>
                        </motion.div>
                      </div>
                    ))}

                    {/* temporary placing indicator */}
                    {placingRoom && (
                      <div style={{ position: 'absolute', left: '10px', top: '10px' }} className="p-2 bg-amber-100 rounded">Клікніть на карті, щоб встановити {placingRoom.id}</div>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Search/> <input className="outline-none" placeholder="Пошук уроку/вчителя/кабінету" value={query} onChange={e=>setQuery(e.target.value)} />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={()=>{ const id = prompt('ID кабінету для редагування:'); if(id){ const r = roomMap[id]; if(!r) return alert('Не знайдено'); const newName = prompt('Нова назва', r.name); if(newName!==null) setData(d=>({...d, rooms:d.rooms.map(rr=> rr.id===id?{...rr,name:newName}:rr)})); }}}>Редагувати назву</Button>
                        {role==='admin' && <Button onClick={()=>{ const id = prompt('ID для видалення:'); if(id) deleteRoom(id);}}>Видалити кабінет</Button>}
                      </div>
                    </div>

                    <div className="mt-3 h-[260px] overflow-auto">
                      {(dayLessons||[]).length===0 ? <div className="p-4 text-sm text-slate-500">Нічого не знайдено для сьогоднішнього дня.</div> : (
                        <div className="space-y-2">
                          {dayLessons.map((l,idx)=>(
                            <div key={idx} className={`p-3 rounded-xl border ${selectedRoom===l.roomId? 'border-blue-500': 'border-slate-200'}`}>
                              <div className="flex items-center justify-between">
                                <div className="font-semibold">{l.subject}</div>
                                <Badge>{l.timeStart}–{l.timeEnd}</Badge>
                              </div>
                              <div className="text-sm text-slate-600">{l.teacher} • {l.roomId} {roomMap[l.roomId]? `• Поверх ${roomMap[l.roomId].floor}`: '• Кабінет не знайдено'}</div>
                              <div className="mt-2 flex gap-2">
                                <Button onClick={()=> centerOnRoom(l.roomId)}>Показати на карті</Button>
                                <Button onClick={()=> startPlaceRoom(l.roomId, roomMap[l.roomId]?.floor || activeFloor)}>Встановити/Змінити координати</Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-sm font-semibold">Коротка інформація про кабінет</div>
                    {selectedRoom ? (
                      (()=>{ const r = roomMap[selectedRoom]; return r ? (
                        <div className="space-y-2 text-sm">
                          <div><b>{r.id}</b> — {r.name}</div>
                          <div>Координати: {r.x}%, {r.y}%</div>
                          <div>Поверх: {r.floor}</div>
                          <div className="flex gap-2">
                            <Button onClick={()=> startPlaceRoom(r.id, r.floor)}>Змінити координати</Button>
                            {role==='admin' && <Button onClick={()=> deleteRoom(r.id)}>Видалити</Button>}
                          </div>
                        </div>
                      ) : <div>Кабінет не знайдено</div> })()
                    ) : (
                      <div className="text-sm text-slate-500">Виберіть кабінет на карті або урок зі списку</div>
                    )}
                  </div>
                </div>

              </CardContent>
            </Card>
          </div>
        </div>

        <footer className="mt-6 text-xs text-slate-500">Ідеї: інтеграція з Google Workspace для авторизації, QR-коди у коридорах, мобільний режим з GPS/AR-підказками.</footer>
      </div>
    </div>
  );
}
