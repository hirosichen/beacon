'use client';

import { useState, useCallback } from 'react';

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
  const [currentScan, setCurrentScan] = useState<any>(null);

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
    if (!navigator.bluetooth) {
      log('Web Bluetooth API is not available in this browser');
      return;
    }

    let filters: Array<{ name?: string; namePrefix?: string }> = [];

    if (deviceName) {
      filters.push({ name: deviceName });
    }

    if (deviceNamePrefix) {
      filters.push({ namePrefix: deviceNamePrefix });
    }

    let options: ScanOptions = {};
    if (acceptAllAdvertisements) {
      options.acceptAllAdvertisements = true;
    } else {
      options.filters = filters;
    }

    try {
      log('Requesting Bluetooth Scan with options: ' + JSON.stringify(options));
      setIsScanning(true);
      
      // @ts-ignore - Web Bluetooth API types may not be fully available
      const scan = await navigator.bluetooth.requestLEScan(options);
      setCurrentScan(scan);

      log('Scan started with:');
      log(' acceptAllAdvertisements: ' + scan.acceptAllAdvertisements);
      log(' active: ' + scan.active);
      log(' keepRepeatedDevices: ' + scan.keepRepeatedDevices);
      log(' filters: ' + JSON.stringify(scan.filters));

      const handleAdvertisement = (event: AdvertisementEvent) => {
        log('Advertisement received.');
        log('  Device Name: ' + (event.device.name || 'Unknown'));
        log('  Device ID: ' + event.device.id);
        log('  RSSI: ' + event.rssi);
        log('  TX Power: ' + event.txPower);
        log('  UUIDs: ' + JSON.stringify(event.uuids));
        
        event.manufacturerData.forEach((valueDataView, key) => {
          logDataView('Manufacturer', key, valueDataView);
        });
        
        event.serviceData.forEach((valueDataView, key) => {
          logDataView('Service', key, valueDataView);
        });
      };

      // @ts-ignore
      navigator.bluetooth.addEventListener('advertisementreceived', handleAdvertisement);

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
            onClick={clearLogs}
            className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md font-medium"
          >
            Clear Logs
          </button>
        </div>
        
        {!navigator.bluetooth && (
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