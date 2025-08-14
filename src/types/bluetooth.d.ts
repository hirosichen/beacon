interface BluetoothAdvertisementEvent extends Event {
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

interface BluetoothLEScan {
  acceptAllAdvertisements: boolean;
  active: boolean;
  keepRepeatedDevices: boolean;
  filters: Array<{ name?: string; namePrefix?: string }>;
  stop(): void;
}

interface Navigator {
  bluetooth?: {
    requestLEScan(options: {
      acceptAllAdvertisements?: boolean;
      filters?: Array<{ name?: string; namePrefix?: string }>;
    }): Promise<BluetoothLEScan>;
    addEventListener(type: 'advertisementreceived', listener: (event: BluetoothAdvertisementEvent) => void): void;
  };
}