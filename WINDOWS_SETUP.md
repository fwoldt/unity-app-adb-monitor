# Unity ADB Monitor - Windows Setup Anleitung

## 📋 Voraussetzungen

### 1. Node.js installieren
- Gehe zu https://nodejs.org
- Lade die **LTS Version** herunter (empfohlen: v18 oder v20)
- Installiere mit Standard-Einstellungen
- **Wichtig:** Häkchen bei "Add to PATH" setzen

### 2. Android Debug Bridge (ADB) installieren
- Gehe zu https://developer.android.com/studio/releases/platform-tools
- Lade "SDK Platform-Tools for Windows" herunter
- Entpacke in einen Ordner (z.B. `C:\platform-tools\`)
- Füge den Pfad zu den **Umgebungsvariablen** hinzu:
  - Windows-Taste + R → `sysdm.cpl` → Enter
  - Erweitert → Umgebungsvariablen
  - Bei "Systemvariablen" → PATH → Bearbeiten
  - Neuer Eintrag: `C:\platform-tools\`

### 3. Git installieren (optional)
- Gehe zu https://git-scm.com/download/win
- Installiere mit Standard-Einstellungen

## 🚀 Automatische Installation

### Methode 1: Mit Git
```cmd
git clone <REPOSITORY_URL> unity-adb-monitor
cd unity-adb-monitor
setup-windows.bat
```

### Methode 2: Projekt-Ordner kopieren
1. Kopiere den Projekt-Ordner nach `C:\unity-adb-monitor\`
2. Führe `setup-windows.bat` aus

## 📝 Manuelle Installation

### Schritt 1: Projekt vorbereiten
```cmd
# Ordner erstellen
mkdir C:\unity-adb-monitor
cd C:\unity-adb-monitor

# Projekt-Dateien kopieren (alle Dateien aus dem Linux-System)
```

### Schritt 2: Dependencies installieren
```cmd
npm install
```

### Schritt 3: ADB testen
```cmd
adb version
adb devices
```

### Schritt 4: Projekt starten
```cmd
npm start
```

### Schritt 5: Im Browser öffnen
- Öffne http://localhost:3000
- Das Web-Interface sollte erscheinen

## 🔧 Konfiguration

### Android Geräte vorbereiten
1. **USB Debugging aktivieren:**
   - Einstellungen → Über das Telefon → Build-Nummer 7x antippen
   - Zurück → Entwickleroptionen → USB-Debugging aktivieren

2. **Geräte über USB verbinden:**
   ```cmd
   adb devices
   ```

3. **Für WiFi-ADB (optional):**
   ```cmd
   adb tcpip 5555
   adb connect 192.168.1.100:5555
   ```

### CXT PhoneFarm Box Integration
1. **CXT Group Control Software** auf der Box installieren
2. Software starten (WebSocket API auf Port 22223)
3. Im Web-Interface: "Scan Boxes" verwenden

## 🐛 Troubleshooting

### Problem: "adb nicht gefunden"
**Lösung:** ADB Pfad zu PATH hinzufügen
```cmd
set PATH=%PATH%;C:\platform-tools\
```

### Problem: "npm nicht gefunden"
**Lösung:** Node.js neu installieren mit "Add to PATH" Option

### Problem: Port 3000 belegt
**Lösung:** Anderen Port verwenden
```cmd
set PORT=3001
npm start
```

### Problem: Geräte nicht sichtbar
**Lösung:**
1. USB-Debugging prüfen
2. USB-Kabel wechseln
3. ADB neu starten:
   ```cmd
   adb kill-server
   adb start-server
   ```

## 📁 Wichtige Dateien

- `devices.csv` - Geräte-Datenbank
- `config.js` - Konfiguration
- `server.js` - Haupt-Server
- `package.json` - Dependencies

## ⚡ Schnellstart

1. `setup-windows.bat` ausführen
2. `start-server.bat` ausführen
3. Browser zu http://localhost:3000
4. "Scan New Devices" klicken
5. Geräte verwalten

## 🔄 Updates

```cmd
git pull origin master
npm install
```

## 📞 Support

- GitHub Issues: https://github.com/YOUR_REPO/issues
- CXT Manual: https://www.cxtfactory.com/manual
- ADB Dokumentation: https://developer.android.com/studio/command-line/adb