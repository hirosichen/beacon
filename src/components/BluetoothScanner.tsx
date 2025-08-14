'use client';

import { useState, useCallback, useEffect } from 'react';

interface ScanOptions {
  acceptAllAdvertisements?: boolean;
  filters?: Array<{ name?: string; namePrefix?: string }>;
}

interface AdvertisementEvent {
  device: {
    name?: string;
    id: string;
  };
  rssi?: number;
  txPower?: number;
  uuids?: string[];
  manufacturerData: Map<number, DataView>;
  serviceData: Map<string, DataView>;
}

export default function BluetoothScanner() {
  const [isScanning, setIsScanning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [deviceName, setDeviceName] = useState('');
  const [deviceNamePrefix, setDeviceNamePrefix] = useState('');
  const [acceptAllAdvertisements, setAcceptAllAdvertisements] = useState(false);
  const [currentScan, setCurrentScan] = useState<{ active: boolean; stop: () => void } | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const log = useCallback((message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  }, []);

  const logDataView = useCallback((labelOfDataSource: string, key: number | string, valueDataView: DataView) => {
    const hexString = [...new Uint8Array(valueDataView.buffer)].map(b => {
      return b.toString(16).padStart(2, '0');
    }).join(' ');
    const textDecoder = new TextDecoder('ascii');
    const asciiString = textDecoder.decode(valueDataView.buffer);
    log(`  ${labelOfDataSource} Data: ${key}\n    (Hex) ${hexString}\n    (ASCII) ${asciiString}`);
  }, [log]);

  const startScan = async () => {
    if (!isClient || !navigator.bluetooth) {
      log('Web Bluetooth API is not available in this browser');
      return;
    }

    const filters: Array<{ name?: string; namePrefix?: string }> = [];

    if (deviceName) {
      filters.push({ name: deviceName });
    }

    if (deviceNamePrefix) {
      filters.push({ namePrefix: deviceNamePrefix });
    }

    const options: ScanOptions = {};
    if (acceptAllAdvertisements) {
      options.acceptAllAdvertisements = true;
    } else {
      options.filters = filters;
    }

    try {
      log('Requesting Bluetooth Scan with options: ' + JSON.stringify(options));
      setIsScanning(true);
      
      const scan = await navigator.bluetooth!.requestLEScan(options);
      setCurrentScan(scan);

      log('Scan started with:');
      log(' acceptAllAdvertisements: ' + scan.acceptAllAdvertisements);
      log(' active: ' + scan.active);
      log(' keepRepeatedDevices: ' + scan.keepRepeatedDevices);
      log(' filters: ' + JSON.stringify(scan.filters));

      const handleAdvertisement = (event: AdvertisementEvent) => {
        log('━━━ Advertisement received ━━━');
        log('  Device Name: ' + (event.device.name || 'Unknown'));
        log('  Device ID (Chrome Internal): ' + event.device.id);
        log('  RSSI: ' + (event.rssi !== undefined ? event.rssi + ' dBm' : 'Unknown'));
        log('  TX Power: ' + (event.txPower !== undefined ? event.txPower + ' dBm' : 'Not provided'));
        log('  Service UUIDs: ' + (event.uuids?.length ? JSON.stringify(event.uuids) : 'None advertised'));
        
        if (event.manufacturerData.size > 0) {
          log('  📱 Manufacturer Data:');
          event.manufacturerData.forEach((valueDataView, key) => {
            const companyName = getCompanyName(key);
            log(`    Company: ${companyName} (ID: ${key})`);
            
            // Check for iBeacon (Apple Company ID = 76/0x004C)
            if (key === 76) {
              const iBeaconData = parseiBeacon(valueDataView);
              if (iBeaconData) {
                log('    🎯 iBeacon Detected!');
                log(`      UUID: ${iBeaconData.uuid}`);
                log(`      Major: ${iBeaconData.major}`);
                log(`      Minor: ${iBeaconData.minor}`);
                log(`      TX Power: ${iBeaconData.txPower} dBm`);
                return;
              }
            }
            
            logDataView('    Data', '', valueDataView);
          });
        }
        
        if (event.serviceData.size > 0) {
          log('  🔧 Service Data:');
          event.serviceData.forEach((valueDataView, key) => {
            logDataView('    Service', key, valueDataView);
          });
        }
        
        log(''); // Empty line for readability
      };

      const getCompanyName = (id: number): string => {
        const companies: { [key: number]: string } = {
          6: 'Microsoft Corporation',
          76: 'Apple, Inc.',
          224: 'Google',
          89: 'Nuheara Limited',
          117: 'Tencent Holdings Ltd.',
          // Add more as needed
        };
        return companies[id] || `Unknown Company (${id})`;
      };

      const parseiBeacon = (dataView: DataView) => {
        try {
          // iBeacon format: [02 15] + [16-byte UUID] + [2-byte Major] + [2-byte Minor] + [1-byte TX Power]
          if (dataView.byteLength < 23) return null;
          
          const type = dataView.getUint8(0);
          const subType = dataView.getUint8(1);
          
          // Check for iBeacon identifier (0x02 0x15)
          if (type !== 0x02 || subType !== 0x15) return null;
          
          // Extract UUID (16 bytes)
          const uuid = Array.from(new Uint8Array(dataView.buffer, 2, 16))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
            .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
          
          // Extract Major (2 bytes)
          const major = dataView.getUint16(18, false); // big-endian
          
          // Extract Minor (2 bytes)
          const minor = dataView.getUint16(20, false); // big-endian
          
          // Extract TX Power (1 byte, signed)
          const txPower = dataView.getInt8(22);
          
          return { uuid, major, minor, txPower };
        } catch (error) {
          return null;
        }
      };

      navigator.bluetooth!.addEventListener('advertisementreceived', handleAdvertisement);

      // Auto-stop scanning after 30 seconds
      setTimeout(() => {
        if (scan.active) {
          stopScan();
        }
      }, 30000);

    } catch (error) {
      log('Error: ' + (error as Error).message);
      setIsScanning(false);
    }
  };

  const stopScan = () => {
    if (currentScan && currentScan.active) {
      log('Stopping scan...');
      currentScan.stop();
      log('Stopped. scan.active = ' + currentScan.active);
    }
    setIsScanning(false);
    setCurrentScan(null);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const copyAllLogs = async () => {
    const allLogsText = logs.join('\n');
    try {
      await navigator.clipboard.writeText(allLogsText);
      log('All logs copied to clipboard');
    } catch (err) {
      log('Failed to copy logs to clipboard');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">Bluetooth Beacon Scanner</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={acceptAllAdvertisements}
                onChange={(e) => setAcceptAllAdvertisements(e.target.checked)}
                className="form-checkbox h-4 w-4 text-blue-600"
              />
              <span className="text-sm font-medium text-gray-700">All Advertisements</span>
            </label>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Device Name
            </label>
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="Enter device name"
              disabled={acceptAllAdvertisements}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Device Name Prefix
            </label>
            <input
              type="text"
              value={deviceNamePrefix}
              onChange={(e) => setDeviceNamePrefix(e.target.value)}
              placeholder="Enter name prefix"
              disabled={acceptAllAdvertisements}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>
        </div>
        
        <div className="flex space-x-4 mb-6">
          <button
            onClick={isScanning ? stopScan : startScan}
            className={`px-6 py-2 rounded-md font-medium ${
              isScanning
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isScanning ? 'Stop Scanning' : 'Scan for Bluetooth Advertisements'}
          </button>
          
          <button
            onClick={copyAllLogs}
            disabled={logs.length === 0}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Copy All Logs
          </button>
          
          <button
            onClick={clearLogs}
            className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md font-medium"
          >
            Clear Logs
          </button>
        </div>
        
        {isClient && !navigator.bluetooth && (
          <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 mb-6">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  <strong>Note:</strong> Web Bluetooth API is not available in this browser. 
                  Please use Chrome 79+ with the experimental web platform features flag enabled.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-gray-900 rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-bold text-white mb-4">Live Output</h2>
        <div className="bg-black rounded p-4 h-96 overflow-y-auto font-mono text-sm">
          {logs.length === 0 ? (
            <p className="text-green-400">No logs yet. Start scanning to see results...</p>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="text-green-400 mb-1">
                {log}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}