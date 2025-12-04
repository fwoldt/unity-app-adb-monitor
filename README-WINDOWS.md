# 🪟 Unity ADB Monitor für Windows

## ⚡ Schnellstart (3 Schritte)

1. **Projekt kopieren** → `C:\unity-adb-monitor\`
2. **Setup ausführen** → `setup-windows.bat` doppelklicken
3. **Server starten** → `start-server.bat` doppelklicken

→ **Browser öffnet automatisch:** http://localhost:3000

## 📁 Wichtige Dateien

| Datei | Beschreibung |
|-------|-------------|
| `QUICK-START.bat` | 🚀 Haupt-Menü für alle Aktionen |
| `setup-windows.bat` | 🔧 Komplette Ersteinrichtung |
| `install-adb.bat` | 📦 ADB Installation Helper |
| `start-server.bat` | 🎮 Server starten |
| `WINDOWS_SETUP.md` | 📚 Detaillierte Anleitung |

## 🎯 Was wird automatisch gemacht?

✅ **Node.js** prüfen  
✅ **ADB** installieren (mit Hilfe)  
✅ **Dependencies** installieren (`npm install`)  
✅ **Datenbank** erstellen (`devices.csv`)  
✅ **Start-Scripts** generieren  

## 🔧 Voraussetzungen

- **Windows 10/11**
- **Node.js** von https://nodejs.org (LTS Version)
- **Android-Geräte** mit USB-Debugging

## 🚀 Verwendung

### Android-Geräte verbinden:
1. **USB-Debugging** aktivieren (Entwickleroptionen)
2. **USB-Kabel** anschließen
3. **"Scan New Devices"** im Web-Interface klicken

### CXT PhoneFarm Box:
1. **CXT Group Control Software** auf Box installieren
2. **"Scan Boxes"** im Web-Interface verwenden
3. **"Connect All"** für Verbindung

## 🐛 Probleme lösen

| Problem | Lösung |
|---------|--------|
| `adb nicht gefunden` | `install-adb.bat` ausführen |
| `Geräte nicht sichtbar` | USB-Kabel prüfen, `restart-adb.bat` |
| `Port 3000 belegt` | Andere Anwendung beenden oder anderen Port verwenden |
| `npm Fehler` | Node.js neu installieren |

## 📊 Features

- 📱 **Android Device Management** - Real-time device scanning and monitoring
- 📷 **Screenshots** (Live-View) - Automatic screenshot capture and display
- 🔄 **Batch Operations** - Reboot, Unity control, battery management
- 📦 **CXT Box Integration** - WebSocket API connection to PhoneFarm boxes
- 📊 **Device Status Tracking** - Online/offline monitoring with timestamps
- 💾 **CSV Export/Import** - Device database management
- ✏️ **Editable Device Data** - Box names, Unity licenses, emails
- 📦 **Group by Box** - Organized view of devices by PhoneFarm box
- 💾 **Bulk Save** - Save all device data changes at once
- 🔍 **Box Scanning** - Automatic discovery of CXT boxes in network

## ⚙️ Erweiterte Konfiguration

```cmd
# Anderen Port verwenden
set PORT=3001
npm start

# Debug-Modus
set DEBUG=true
npm start
```

## 🔄 Updates

```cmd
# Git Update (falls Repository)
git pull
npm install

# Oder: Neue Dateien kopieren und setup-windows.bat ausführen
```

---

**🎉 Fertig! Dein Unity ADB Monitor läuft jetzt auf Windows!**