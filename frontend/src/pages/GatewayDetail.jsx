import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router";
import {
  Loader2,
  Trash2,
  Plus,
  Check,
  Wifi,
  WifiOff,
  AlertCircle,
  Download,
  Save,
  Eye,
  NotebookPen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/providers/trpc";
import { useGatewaySSE } from "@/hooks/useGatewaySSE";
import Navbar from "@/components/Navbar";
import Breadcrumb from "@/components/Breadcrumb";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const EMPTY_ROW = {
  parameterName: "",
  deviceName: "",
  unit: "",
  slaveId: "",
  functionCode: 3,
  address: 0,
  length: 1,
  dataType: "Int",
  scaleFactor: 1,
  baudRate: 9600,
  dataBits: 8,
  parity: 0,
  stopBits: 1,
};

const TABLE_COLUMNS = [
  { key: "slNo", label: "Sl No", type: "text", width: "w-16", isSerial: true },
  { key: "parameterName", label: "Parameter Name", type: "text", width: "w-40" },
  { key: "deviceName", label: "Device Name", type: "text", width: "w-36" },
  { key: "unit", label: "Unit", type: "text", width: "w-20" },
  { key: "slaveId", label: "Slave ID", type: "number", width: "w-20" },
  { key: "functionCode", label: "Func Code", type: "number", width: "w-20" },
  { key: "address", label: "Address", type: "number", width: "w-20" },
  { key: "length", label: "Length", type: "number", width: "w-16" },
  { key: "dataType", label: "Data Type", type: "text", width: "w-24" },
  { key: "scaleFactor", label: "Scale", type: "number", width: "w-16" },
  { key: "baudRate", label: "Baud Rate", type: "number", width: "w-24" },
  { key: "dataBits", label: "Data Bits", type: "number", width: "w-20" },
  { key: "parity", label: "Parity", type: "number", width: "w-16" },
  { key: "stopBits", label: "Stop Bits", type: "number", width: "w-20" },
];

export default function GatewayDetail() {
  const { companyId, gatewayId } = useParams();

  const gateway = trpc.gateway.get.useQuery(
    { id: gatewayId },
    { enabled: !!gatewayId }
  );

  const prefix = gateway.data?.prefix ?? null;

  // SSE connection for this gateway
  const { messages, connected: sseConnected, clearMessages } = useGatewaySSE(prefix);

  // Group configuration
  const GROUPS_COUNT = 5;
  const PARAMETERS_PER_GROUP = 200;

  // Active group state (0-4, default to 0)
  const [activeGroup, setActiveGroup] = useState(0);

  // Enabled groups state (array of booleans, first group enabled by default)
  const [enabledGroups, setEnabledGroups] = useState([true, false, false, false, false]);

  // Config rows state per group
  const [groupData, setGroupData] = useState(
    Array.from({ length: GROUPS_COUNT }, () => ({
      publishRows: [],
      readRows: [],
      wifiRows: [],
    }))
  );

  // Active view state ("publish" | "read" | "wifi")
  const [activeView, setActiveView] = useState("publish");

  // UI states
  const [publishing, setPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [publishProgress, setPublishProgress] = useState({ current: 0, total: 0 });
  const [reading, setReading] = useState(false);
  const [readProgress, setReadProgress] = useState({ current: 0, total: 0 });
  const [showLiveBanner, setShowLiveBanner] = useState(false);

  const [readingWifi, setReadingWifi] = useState(false);
  const [showWifiLiveBanner, setShowWifiLiveBanner] = useState(false);

  const [testStatus, setTestStatus] = useState(null);
  const [testing, setTesting] = useState(false);

  const publishMutation = trpc.mqtt.publish.useMutation();

  // Helper functions to get/set data for active group
  const getActiveGroupData = () => groupData[activeGroup];
  const updateActiveGroupData = (updater) => {
    setGroupData(prev => {
      const newData = [...prev];
      newData[activeGroup] = updater(newData[activeGroup]);
      return newData;
    });
  };

  // Handle incoming SSE messages (ReadConfig & Wifi responses)
  useEffect(() => {
    if (messages.length === 0) return;

    const latestMessage = messages[messages.length - 1];
    if (latestMessage.type === "message" && latestMessage.payload) {
      const payload = latestMessage.payload.trim();
      const topic = (latestMessage.topic || "").toLowerCase();

      // 1. Modbus Config response (ends with /readconfig/res or /readconfig/GroupX/res)
      if (topic.endsWith("/readconfig/res") || topic.match(/\/readconfig\/group\d+\/res$/i)) {
        // Extract group number from topic if present
        const groupMatch = topic.match(/\/group(\d+)\/res$/i);
        const responseGroup = groupMatch ? parseInt(groupMatch[1]) - 1 : activeGroup;

        setActiveView("read");
        try {
          let parsedRows = [];

          // Option 1: Parse as JSON array
          if (payload.startsWith("[") && payload.endsWith("]")) {
            const parsed = JSON.parse(payload);
            if (Array.isArray(parsed)) {
              parsedRows = parsed.map((r) => ({
                parameterName: String(r.parameterName ?? ""),
                deviceName: String(r.deviceName ?? ""),
                slaveId: Number(r.slaveId ?? 1),
                functionCode: Number(r.functionCode ?? 3),
                address: Number(r.address ?? 0),
                length: Number(r.length ?? 1),
                dataType: String(r.dataType ?? "Float"),
                scaleFactor: Number(r.scaleFactor ?? 1),
                baudRate: Number(r.baudRate ?? 9600),
                dataBits: Number(r.dataBits ?? 8),
                parity: Number(r.parity ?? 0),
                stopBits: Number(r.stopBits ?? 1),
              }));
            }
          }

          // Option 2: Parse as flat comma-separated list of quoted values
          if (payload.startsWith('"') && payload.endsWith('"')) {
            const raw = payload.slice(1, -1);
            const items = raw.split('","');
            if (items.length > 0 && items.length % 12 === 0) {
              for (let i = 0; i < items.length; i += 12) {
                const param = items[i];
                const device = items[i+1];
                const slave = Number(items[i+2]) || 1;
                const func = Number(items[i+3]) || 3;
                const addr = Number(items[i+4]) || 0;
                const len = Number(items[i+5]) || 1;

                let dType = items[i+6];
                if (dType.toLowerCase() === "int") dType = "Int";
                if (dType.toLowerCase() === "float") dType = "Float";

                const scale = Number(items[i+7]) || 1.0;
                const baud = Number(items[i+8]) || 9600;
                const dBits = Number(items[i+9]) || 8;

                let parityVal = 0;
                const parityLower = items[i+10].toLowerCase();
                if (parityLower === "even") parityVal = 1;
                if (parityLower === "odd") parityVal = 2;

                const sBits = Number(items[i+11]) || 1;

                parsedRows.push({
                  parameterName: param,
                  deviceName: device,
                  slaveId: slave,
                  functionCode: func,
                  address: addr,
                  length: len,
                  dataType: dType,
                  scaleFactor: scale,
                  baudRate: baud,
                  dataBits: dBits,
                  parity: parityVal,
                  stopBits: sBits,
                });
              }
            }
          }

          // Append batch data to existing readRows for the specific group
          if (parsedRows.length > 0) {
            setGroupData(prev => {
              const newData = [...prev];
              newData[responseGroup] = {
                ...newData[responseGroup],
                readRows: [...newData[responseGroup].readRows, ...parsedRows]
              };
              return newData;
            });
          }

          // Check if all batches are received
          // We'll use a timeout to determine when reading is complete
          // In production, you might want to track expected batch count
        } catch (err) {
          console.error("Failed to parse read response:", err);
        }
      }

      // 2. Wifi response (ends with /wifi/res or /wifi/GroupX/res)
      if (topic.endsWith("/wifi/res") || topic.match(/\/wifi\/group\d+\/res$/i)) {
        // Extract group number from topic if present
        const groupMatch = topic.match(/\/group(\d+)\/res$/i);
        const responseGroup = groupMatch ? parseInt(groupMatch[1]) - 1 : activeGroup;

        setActiveView("wifi");
        try {
          // Option 1: Parse as JSON array
          if (payload.startsWith("[") && payload.endsWith("]")) {
            const parsed = JSON.parse(payload);
            if (Array.isArray(parsed)) {
              const validRows = parsed.map((r) => ({
                publishConfig: String(r.PublishConfig ?? r.publishConfig ?? r.publish_config ?? ""),
                readConfig: String(r.ReadConfig ?? r.readConfig ?? r.read_config ?? ""),
                wifi: String(r.WiFi ?? r.wifi ?? ""),
                location: String(r.Location ?? r.location ?? ""),
                delay: String(r.Delay ?? r.delay ?? ""),
              }));
              setGroupData(prev => {
                const newData = [...prev];
                newData[responseGroup] = {
                  ...newData[responseGroup],
                  wifiRows: validRows
                };
                return newData;
              });
              setReadingWifi(false);
              setShowWifiLiveBanner(true);
              return;
            }
          }

          // Option 2: Parse as single JSON object
          if (payload.startsWith("{") && payload.endsWith("}")) {
            const r = JSON.parse(payload);
            setGroupData(prev => {
              const newData = [...prev];
              newData[responseGroup] = {
                ...newData[responseGroup],
                wifiRows: [{
                  publishConfig: String(r.PublishConfig ?? r.publishConfig ?? r.publish_config ?? ""),
                  readConfig: String(r.ReadConfig ?? r.readConfig ?? r.read_config ?? ""),
                  wifi: String(r.WiFi ?? r.wifi ?? ""),
                  location: String(r.Location ?? r.location ?? ""),
                  delay: String(r.Delay ?? r.delay ?? ""),
                }]
              };
              return newData;
            });
            setReadingWifi(false);
            setShowWifiLiveBanner(true);
            return;
          }

          // Option 3: Parse as flat comma-separated list (quoted or unquoted)
          const items = payload.split(',').map(s => {
            let clean = s.trim();
            if (clean.startsWith('"') && clean.endsWith('"')) {
              clean = clean.slice(1, -1);
            }
            return clean;
          });
          if (items.length > 0 && items.length % 5 === 0) {
            const parsedRows = [];
            for (let i = 0; i < items.length; i += 5) {
              parsedRows.push({
                publishConfig: items[i],
                readConfig: items[i+1],
                wifi: items[i+2],
                location: items[i+3],
                delay: items[i+4],
              });
            }
            setGroupData(prev => {
              const newData = [...prev];
              newData[responseGroup] = {
                ...newData[responseGroup],
                wifiRows: parsedRows
              };
              return newData;
            });
            setReadingWifi(false);
            setShowWifiLiveBanner(true);
          }
        } catch (err) {
          console.error("Failed to parse wifi response:", err);
        }
      }

      // 3. Test response (ends with /test/res or /Test/res)
      if (topic.endsWith("/test/res") || topic.endsWith("/Test/res")) {
        // Clear the timeout since we got a response
        if (window.testTimeout) {
          clearTimeout(window.testTimeout);
          window.testTimeout = null;
        }

        setTesting(false);

        // Check if response is "1" for connected
        if (payload === "1") {
          setTestStatus("connected");
          toast.success("Connected");
        } else {
          setTestStatus("disconnected");
          toast.error("Disconnected");
        }
      }
    }
  }, [messages, activeGroup, testing]);

  // Handle batch reading completion
  useEffect(() => {
    if (reading && readProgress.current > 0 && readProgress.current === readProgress.total) {
      // All batches have been sent, wait a bit for responses then stop reading
      const timeout = setTimeout(() => {
        setReading(false);
        setReadProgress({ current: 0, total: 0 });
      }, 3000); // Wait 3 seconds for all responses to arrive

      return () => clearTimeout(timeout);
    }
  }, [readProgress, reading]);

  // Add a new row
  const addRow = useCallback(() => {
    updateActiveGroupData(prev => {
      if (activeView === "publish") {
        if (prev.publishRows.length >= PARAMETERS_PER_GROUP) {
          toast.error(`Maximum ${PARAMETERS_PER_GROUP} parameters allowed per group`);
          return prev;
        }
        return { ...prev, publishRows: [...prev.publishRows, { ...EMPTY_ROW }] };
      } else if (activeView === "read") {
        if (prev.readRows.length >= PARAMETERS_PER_GROUP) {
          toast.error(`Maximum ${PARAMETERS_PER_GROUP} parameters allowed per group`);
          return prev;
        }
        return { ...prev, readRows: [...prev.readRows, { ...EMPTY_ROW }] };
      }
      return prev;
    });
  }, [activeView, updateActiveGroupData]);

  // Remove a row
  const removeRow = useCallback((index) => {
    updateActiveGroupData(prev => {
      if (activeView === "publish") {
        return { ...prev, publishRows: prev.publishRows.filter((_, i) => i !== index) };
      } else if (activeView === "read") {
        return { ...prev, readRows: prev.readRows.filter((_, i) => i !== index) };
      }
      return prev;
    });
  }, [activeView, updateActiveGroupData]);

  // Update a cell value
  const updateCell = useCallback(
    (index, key, value) => {
      updateActiveGroupData(prev => {
        if (activeView === "publish") {
          const updated = [...prev.publishRows];
          const row = { ...updated[index] };
          row[key] = value;
          updated[index] = row;
          return { ...prev, publishRows: updated };
        } else if (activeView === "read") {
          const updated = [...prev.readRows];
          const row = { ...updated[index] };
          row[key] = value;
          updated[index] = row;
          return { ...prev, readRows: updated };
        }
        return prev;
      });
    },
    [activeView, updateActiveGroupData]
  );

  // Helper function to create batches based on the pattern: 200, 200, 200, 200, 200, then repeat
  const createBatches = (totalItems) => {
    const batches = [];
    const pattern = [200, 200, 200, 200, 200];
    let currentIndex = 0;
    let patternIndex = 0;

    while (currentIndex < totalItems) {
      const batchSize = pattern[patternIndex % pattern.length];
      const endIndex = Math.min(currentIndex + batchSize, totalItems);
      batches.push({
        start: currentIndex,
        end: endIndex,
        size: endIndex - currentIndex
      });
      currentIndex = endIndex;
      patternIndex++;
    }

    return batches;
  };

  // Publish Config (Setconfig) - Batch-wise publishing for active group
  const handlePublish = async () => {
    if (!prefix) return;
    const activeData = getActiveGroupData();
    if (activeData.publishRows.length === 0) return;

    setActiveView("publish");
    setPublishing(true);
    setPublishSuccess(false);

    // Map each row into a flat list of 12 formatted string fields
    const getRowValues = (r) => {
      const param = String(r.parameterName || "").trim();
      const device = String(r.deviceName || "").trim();
      const slave = String(parseInt(String(r.slaveId), 10) || 0);
      const func = String(parseInt(String(r.functionCode), 10) || 3);
      const addr = String(parseInt(String(r.address), 10) || 0);
      const len = String(parseInt(String(r.length), 10) || 1);
      const dType = String(r.dataType || "Float").toLowerCase(); // "float" or "int"
      const scale = String(parseFloat(String(r.scaleFactor)) || 1.0);
      const baud = String(parseInt(String(r.baudRate), 10) || 9600);
      const dBits = String(parseInt(String(r.dataBits), 10) || 8);

      let parityStr = "none";
      const parityNum = parseInt(String(r.parity), 10) || 0;
      if (parityNum === 1) parityStr = "even";
      if (parityNum === 2) parityStr = "odd";

      const sBits = String(parseInt(String(r.stopBits), 10) || 1);

      return [param, device, slave, func, addr, len, dType, scale, baud, dBits, parityStr, sBits];
    };

    // Limit to PARAMETERS_PER_GROUP (200) per group
    const rowsToPublish = activeData.publishRows.slice(0, PARAMETERS_PER_GROUP);

    // Create batches
    const batches = createBatches(rowsToPublish.length);
    setPublishProgress({ current: 0, total: batches.length });

    try {
      // Publish each batch sequentially with group prefix
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const batchRows = rowsToPublish.slice(batch.start, batch.end);
        const allValues = batchRows.flatMap(getRowValues);
        const payloadString = allValues.map((v) => `"${v}"`).join(",");

        await publishMutation.mutateAsync({
          topic: `${prefix}/Setconfig/Group${activeGroup + 1}`,
          payload: payloadString,
        });

        // Update progress
        setPublishProgress({ current: i + 1, total: batches.length });

        // Small delay between batches to avoid overwhelming the gateway
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      setPublishSuccess(true);
      setTimeout(() => setPublishSuccess(false), 2000);
    } catch (err) {
      console.error("Publish failed:", err);
    } finally {
      setPublishing(false);
      setPublishProgress({ current: 0, total: 0 });
    }
  };

  // Read Config (trigger ReadConfig → subscribe to ReadConfig/Res) - Batch-wise reading for active group
  const handleReadConfig = async () => {
    if (!prefix) return;
    setActiveView("read");
    setReading(true);
    setShowLiveBanner(true);
    clearMessages();

    // Clear previous data for active group
    updateActiveGroupData(prev => ({ ...prev, readRows: [] }));

    // Create batches for reading (limit to PARAMETERS_PER_GROUP)
    const batches = createBatches(PARAMETERS_PER_GROUP);
    setReadProgress({ current: 0, total: batches.length });

    try {
      // Send read requests for each batch sequentially with group prefix
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        // Send batch range as payload (e.g., "1-200", "200-400", etc.)
        const payload = `${batch.start + 1}-${batch.end}`;

        await publishMutation.mutateAsync({
          topic: `${prefix}/Readconfig/Group${activeGroup + 1}`,
          payload: payload,
        });

        // Update progress
        setReadProgress({ current: i + 1, total: batches.length });

        // Small delay between batches to avoid overwhelming the gateway
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      // The SSE connection is already active and will receive the responses
    } catch (err) {
      console.error("ReadConfig trigger failed:", err);
      setReading(false);
      setReadProgress({ current: 0, total: 0 });
    }
  };

  // Wifi Trigger (trigger Wifi → subscribe to Wifi/res) for active group
  const handleWifi = async () => {
    if (!prefix) return;
    setActiveView("wifi");
    setReadingWifi(true);
    setShowWifiLiveBanner(true);

    // Clear previous data for active group
    updateActiveGroupData(prev => ({ ...prev, wifiRows: [] }));

    try {
      await publishMutation.mutateAsync({
        topic: `${prefix}/Wifi/Group${activeGroup + 1}`,
        payload: "1",
      });
    } catch (err) {
      console.error("Wifi trigger failed:", err);
      setReadingWifi(false);
    }
  };

  // Test connection
  const handleTest = async () => {
    if (!prefix) {
      toast.error("Gateway prefix not available");
      return;
    }

    // Clear any existing timeout
    if (window.testTimeout) {
      clearTimeout(window.testTimeout);
      window.testTimeout = null;
    }

    setTesting(true);
    setTestStatus(null);

    try {
      // Publish test message
      await publishMutation.mutateAsync({
        topic: `${prefix}/Test`,
        payload: "1",
      });

      // Set timeout for no response
      const timeout = setTimeout(() => {
        setTesting(false);
        setTestStatus("disconnected");
        toast.error("Disconnected");
      }, 5000); // 5 second timeout

      // Store timeout ID to clear it if response arrives
      window.testTimeout = timeout;
    } catch (err) {
      console.error("Test failed:", err);
      setTesting(false);
      setTestStatus("disconnected");
      toast.error("Disconnected");
    }
  };

  // Export to Excel
  const handleSave = () => {
    const activeData = getActiveGroupData();
    let data = [];
    let fileName = "";

    if (activeView === "publish") {
      data = activeData.publishRows;
      fileName = `${prefix}_Group${activeGroup + 1}_publish_config.xlsx`;
    } else if (activeView === "read") {
      data = activeData.readRows;
      fileName = `${prefix}_Group${activeGroup + 1}_read_config.xlsx`;
    } else if (activeView === "wifi") {
      data = activeData.wifiRows;
      fileName = `${prefix}_Group${activeGroup + 1}_wifi_status.xlsx`;
    }

    if (data.length === 0) {
      toast.error("No data to export");
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Config");
    XLSX.writeFile(workbook, fileName);
    toast.success("Excel file downloaded");
  };

  // Import from Excel
  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
          toast.error("Excel file is empty");
          return;
        }

        // Warn if imported data exceeds limit
        if (jsonData.length > PARAMETERS_PER_GROUP) {
          toast.warning(`Excel file contains ${jsonData.length} rows, but only ${PARAMETERS_PER_GROUP} will be imported (maximum per group)`);
        }

        // Validate and transform data based on active view
        if (activeView === "publish" || activeView === "read") {
          const validRows = jsonData.map((row) => ({
            parameterName: String(row.parameterName || row.ParameterName || ""),
            deviceName: String(row.deviceName || row.DeviceName || ""),
            unit: String(row.unit || row.Unit || ""),
            slaveId: Number(row.slaveId || row.SlaveId || 1),
            functionCode: Number(row.functionCode || row.FunctionCode || 3),
            address: Number(row.address || row.Address || 0),
            length: Number(row.length || row.Length || 1),
            dataType: String(row.dataType || row.DataType || "Int"),
            scaleFactor: Number(row.scaleFactor || row.ScaleFactor || 1),
            baudRate: Number(row.baudRate || row.BaudRate || 9600),
            dataBits: Number(row.dataBits || row.DataBits || 8),
            parity: Number(row.parity || row.Parity || 0),
            stopBits: Number(row.stopBits || row.StopBits || 1),
          }));

          // Limit to PARAMETERS_PER_GROUP
          const limitedRows = validRows.slice(0, PARAMETERS_PER_GROUP);

          if (activeView === "publish") {
            updateActiveGroupData(prev => ({ ...prev, publishRows: limitedRows }));
          } else {
            updateActiveGroupData(prev => ({ ...prev, readRows: limitedRows }));
          }
        } else if (activeView === "wifi") {
          const validRows = jsonData.map((row) => ({
            publishConfig: String(row.publishConfig || row.PublishConfig || ""),
            readConfig: String(row.readConfig || row.ReadConfig || ""),
            wifi: String(row.wifi || row.WiFi || ""),
            location: String(row.location || row.Location || ""),
            delay: String(row.delay || row.Delay || ""),
          }));
          updateActiveGroupData(prev => ({ ...prev, wifiRows: validRows }));
        }

        toast.success(`Imported ${jsonData.length} rows from Excel`);
      } catch (err) {
        console.error("Import failed:", err);
        toast.error("Failed to import Excel file");
      }
    };
    reader.readAsArrayBuffer(file);
    // Reset file input
    e.target.value = "";
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <Navbar />
      <main className="max-w-[1400px] mx-auto p-6">
        {gateway.data?.company && (
          <Breadcrumb
            segments={[
              { label: "Companies", to: "/" },
              { label: gateway.data.company.name, to: `/companies/${companyId}` },
              { label: gateway.data.prefix },
            ]}
          />
        )}

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-[#212529] tracking-tight">
                {gateway.data?.prefix ?? "Loading..."}
              </h1>
              {/* {testStatus === "connected" ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-[#E6F4EA] text-[#198754] px-2.5 py-1 rounded-full">
                  <Wifi className="w-3 h-3" />
                  Connected
                </span>
              ) : testStatus === "disconnected" ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-[#FDECEE] text-[#DC3545] px-2.5 py-1 rounded-full">
                  <WifiOff className="w-3 h-3" />
                  Disconnected
                </span>
              ) : sseConnected ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-[#E6F4EA] text-[#198754] px-2.5 py-1 rounded-full">
                  <Wifi className="w-3 h-3" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-[#FDECEE] text-[#DC3545] px-2.5 py-1 rounded-full">
                  <WifiOff className="w-3 h-3" />
                  Disconnected
                </span>
              )} */}
            </div>
            {gateway.data?.company && (
              <p className="text-sm text-[#6C757D] mt-1">
                {gateway.data.company.name}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleTest}
              disabled={testing || !prefix}
              className="h-10 px-5 bg-[#4361EE] hover:bg-[#3A53D0] text-white disabled:opacity-50 cursor-pointer"
            >
              {testing ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              {testing ? "Testing..." : "Test"}
            </Button>
            {testStatus && (
              <span className={`text-sm font-medium ${
                testStatus === "connected" ? "text-green-600" : "text-red-600"
              }`}>
                {testStatus === "connected" ? "✓ Connected" : "✗ Disconnected"}
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end mt-6">

        </div>

        {/* Group Selection Tabs */}
        <div className="mb-4">
          <div className="flex items-center gap-2">
            {Array.from({ length: GROUPS_COUNT }).map((_, index) => (
              <button
                key={index}
                onClick={() => setActiveGroup(index)}
                disabled={!enabledGroups[index]}
                className={`px-4 py-2 text-sm font-medium transition-all cursor-pointer rounded-lg ${
                  activeGroup === index
                    ? "bg-[#4361EE] text-white shadow-lg ring-2 ring-[#4361EE] ring-offset-2 scale-105"
                    : enabledGroups[index]
                    ? "bg-white text-[#6C757D] hover:bg-[#F8F9FA] border border-[#E9ECEF]"
                    : "bg-[#F8F9FA] text-[#ADB5BD] border border-[#E9ECEF] cursor-not-allowed"
                }`}
              >
                {activeGroup === index && (
                  <span className="inline-flex items-center gap-1">
                    <Check className="w-3 h-3" />
                  </span>
                )}
                Group {index + 1}
                {activeGroup === index && (
                  <span className="ml-1 text-xs opacity-80">(Active)</span>
                )}
                {!enabledGroups[index] && " (Disabled)"}
              </button>
            ))}
          </div>
        </div>

        {/* Navigation Tabs & Tables Container */}
        <div className="border-4 border-double border-[#E9ECEF] rounded-xl p-4">

        {/* Navigation Tabs */}

        <div className="flex items-center justify-between mb-6 border-b border-[#E9ECEF]">

  {/* Left Side Tabs */}
  <div className="flex items-center gap-2">
    <button
      onClick={() => setActiveView("publish")}
      className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
        activeView === "publish"
          ? "text-[#4361EE] border-b-2 border-[#4361EE] -mb-[1px]"
          : "text-[#6C757D] hover:text-[#212529]"
      }`}
    >
      Publish Config
    </button>

    <button
      onClick={() => setActiveView("read")}
      className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
        activeView === "read"
          ? "text-[#4361EE] border-b-2 border-[#4361EE] -mb-[1px]"
          : "text-[#6C757D] hover:text-[#212529]"
      }`}
    >
      Read Config
    </button>

    <button
      onClick={handleWifi}
      disabled={readingWifi || !prefix}
      className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
        activeView === "wifi"
          ? "text-[#4361EE] border-b-2 border-[#4361EE] -mb-[1px]"
          : "text-[#6C757D] hover:text-[#212529]"
      }`}
    >
      {readingWifi ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin mr-2 inline" />
          Fetching...
        </>
      ) : (
        <>
          <Wifi className="w-4 h-4 mr-2 inline text-[#4361EE]" />
          WiFi
        </>
      )}
    </button>
  </div>

  {/* Right Side Import Button */}
  <input
    type="file"
    accept=".xlsx,.xls"
    onChange={handleImport}
    className="hidden"
    id="import-file-input"
  />
  <Button
    variant="outline"
    className="mb-2 border-[#4361EE] text-[#4361EE] cursor-pointer"
    onClick={() => document.getElementById('import-file-input').click()}
  >
    <Download className="w-4 h-4 mr-2" />
    Import
  </Button>

</div>

        {/* Live Data Banners */}
        {showLiveBanner && activeView === "read" && (
          <div className="mb-4 flex items-center gap-2 text-xs bg-[#E0F7FA] border border-[#0DCAF0] text-[#0DCAF0] px-4 py-2.5 rounded-lg">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              Showing live data from {prefix}/Readconfig/Group{activeGroup + 1}/res — Group {activeGroup + 1} — not saved to
              database
            </span>
          </div>
        )}

        {showWifiLiveBanner && activeView === "wifi" && (
          <div className="mb-4 flex items-center gap-2 text-xs bg-[#E8F5E9] border border-[#2E7D32] text-[#2E7D32] px-4 py-2.5 rounded-lg animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0 text-[#2E7D32]" />
            <span>
              Showing live WiFi & System status from {prefix}/Wifi/Group{activeGroup + 1}/res — Group {activeGroup + 1} — not saved to
              database
            </span>
          </div>
        )}

        {/* Loading state */}
        {gateway.isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-[#4361EE]" />
          </div>
        )}

        {/* Publish Config Table */}
        {gateway.data && activeView === "publish" && (
          <div className="bg-white border border-[#E9ECEF] rounded-xl overflow-hidden shadow-sm">
            {/* Table with horizontal and vertical scroll */}
            <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
              <table className="w-full min-w-[1200px]">
                <thead>
                  <tr className="bg-[#F8F9FA] border-b-2 border-[#E9ECEF]">
                    {TABLE_COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        className={`${col.width} px-2 py-3 text-center text-xs font-semibold text-[#6C757D] uppercase tracking-wider`}
                      >
                        {col.label}
                      </th>
                    ))}
                    <th className="w-16 px-2 py-3 text-center text-xs font-semibold text-[#6C757D] uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9ECEF]">
                  {getActiveGroupData().publishRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={TABLE_COLUMNS.length + 1}
                        className="px-4 py-12 text-center text-sm text-[#6C757D]"
                      >
                        No configuration data. Click{" "}
                        <span className="font-medium text-[#4361EE]">Add Row</span> to
                        manually create.
                      </td>
                    </tr>
                  )}
                  {getActiveGroupData().publishRows.map((row, index) => (
                    <tr
                      key={index}
                      className="hover:bg-[#F8F9FA] transition-colors"
                    >
                      {TABLE_COLUMNS.map((col) => {
                        const cellValue = row[col.key] ?? "";

                        // Handle serial number column (read-only, auto-increment)
                        if (col.isSerial) {
                          return (
                            <td key={col.key} className={`${col.width} px-2 py-2 text-center`}>
                              <span className="text-sm text-[#212529] font-medium">{index + 1}</span>
                            </td>
                          );
                        }

                        if (col.key === "dataType") {
                          return (
                            <td key={col.key} className={`${col.width} px-2 py-2 text-center`}>
                              <select
                                value={cellValue}
                                onChange={(e) => updateCell(index, col.key, e.target.value)}
                                className="w-full bg-white border border-[#E9ECEF] focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] rounded-lg text-center [text-align-last:center] cursor-pointer"
                              >
                                <option value="Int">Int</option>
                                <option value="Float">Float</option>
                              </select>
                            </td>
                          );
                        }

                        if (col.key === "parity") {
                          return (
                            <td key={col.key} className={`${col.width} px-2 py-2 text-center`}>
                              <select
                                value={cellValue}
                                onChange={(e) => updateCell(index, col.key, e.target.value)}
                                className="w-full bg-white border border-[#E9ECEF] focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] font-mono text-center [text-align-last:center] rounded-lg cursor-pointer"
                              >
                                <option value="0">0 (None)</option>
                                <option value="1">1 (Even)</option>
                                <option value="2">2 (Odd)</option>
                              </select>
                            </td>
                          );
                        }

                        if (col.key === "stopBits") {
                          return (
                            <td key={col.key} className={`${col.width} px-2 py-2 text-center`}>
                              <select
                                value={cellValue}
                                onChange={(e) => updateCell(index, col.key, e.target.value)}
                                className="w-full bg-white border border-[#E9ECEF] focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] font-mono text-center [text-align-last:center] rounded-lg cursor-pointer"
                              >
                                <option value="1">1</option>
                                <option value="2">2</option>
                              </select>
                            </td>
                          );
                        }

                        if (col.key === "dataBits") {
                          return (
                            <td key={col.key} className={`${col.width} px-2 py-2 text-center`}>
                              <select
                                value={cellValue}
                                onChange={(e) => updateCell(index, col.key, e.target.value)}
                                className="w-full bg-white border border-[#E9ECEF] focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] font-mono text-center [text-align-last:center] rounded-lg cursor-pointer"
                              >
                                <option value="8">8</option>
                                <option value="7">7</option>
                              </select>
                            </td>
                          );
                        }

                        if (col.key === "functionCode") {
                          return (
                            <td key={col.key} className={`${col.width} px-2 py-2 text-center`}>
                              <select
                                value={cellValue}
                                onChange={(e) => updateCell(index, col.key, e.target.value)}
                                className="w-full bg-white border border-[#E9ECEF] focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] font-mono text-center [text-align-last:center] rounded-lg cursor-pointer"
                              >
                                <option value="1">1 (Coils)</option>
                                <option value="2">2 (Inputs)</option>
                                <option value="3">3 (Holding)</option>
                                <option value="4">4 (Input Reg)</option>
                                <option value="5">5 (Write Coil)</option>
                                <option value="6">6 (Write Reg)</option>
                                <option value="15">15 (Write Coils)</option>
                                <option value="16">16 (Write Regs)</option>
                              </select>
                            </td>
                          );
                        }

                        return (
                          <td key={col.key} className={`${col.width} px-2 py-2 text-center`}>
                            <input
                              type="text"
                              value={cellValue}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (col.type === "number") {
                                  // Allow integers, decimals, negative signs, and empty inputs during typing
                                  if (/^-?\d*\.?\d*$/.test(val)) {
                                    updateCell(index, col.key, val);
                                  }
                                } else {
                                  updateCell(index, col.key, val);
                                }
                              }}
                              className="w-full bg-white border border-[#E9ECEF] focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] rounded-lg text-center"
                            />
                          </td>
                        );
                      })}
                      <td className="w-16 px-2 py-2 text-center">
                        <button
                          onClick={() => removeRow(index)}
                          className="p-1.5 text-[#ADB5BD] hover:text-[#DC3545] hover:bg-[#FDECEE] rounded-lg transition-colors inline-flex items-center justify-center cursor-pointer"
                          title="Delete row"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add Row Button */}
            <div className="px-4 py-3 border-t border-[#E9ECEF]">
              <button
                onClick={addRow}
                disabled={getActiveGroupData().publishRows.length >= PARAMETERS_PER_GROUP}
                className="inline-flex items-center gap-1.5 text-sm text-[#4361EE] hover:text-[#3A53D0] font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                Add Row
              </button>
              <span className="ml-4 text-xs text-[#6C757D]">
                {getActiveGroupData().publishRows.length} / {PARAMETERS_PER_GROUP}
              </span>
              <div className="flex justify-end">
                <Button
                  onClick={handlePublish}
                  disabled={publishing || getActiveGroupData().publishRows.length === 0 || !prefix}
                  className="h-10 px-5 bg-[#4361EE] hover:bg-[#3A53D0] text-white disabled:opacity-50 cursor-pointer"
                >
                  {publishing ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : publishSuccess ? (
                    <Check className="w-4 h-4 mr-2" />
                  ) : null}
                  <NotebookPen className="w-4 h-4 mr-2" />
                  {publishSuccess
                    ? "Written"
                    : publishing
                    ? `Writing batch ${publishProgress.current}/${publishProgress.total}`
                    : "Write to Gateway"}
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={getActiveGroupData().publishRows.length === 0}
                  className="h-10 px-5 bg-[#4361EE] hover:bg-[#3A53D0] text-white disabled:opacity-50 cursor-pointer ml-2"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Read Config Table */}
        {gateway.data && activeView === "read" && (
          <div className="bg-white border border-[#E9ECEF] rounded-xl overflow-hidden shadow-sm">
            {/* Table with horizontal and vertical scroll */}
            <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
              <table className="w-full min-w-[1200px]">
                <thead>
                  <tr className="bg-[#F8F9FA] border-b-2 border-[#E9ECEF]">
                    {TABLE_COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        className={`${col.width} px-2 py-3 text-center text-xs font-semibold text-[#6C757D] uppercase tracking-wider`}
                      >
                        {col.label}
                      </th>
                    ))}
                    <th className="w-16 px-2 py-3 text-center text-xs font-semibold text-[#6C757D] uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9ECEF]">
                  {getActiveGroupData().readRows.length === 0 && !reading && (
                    <tr>
                      <td
                        colSpan={TABLE_COLUMNS.length + 1}
                        className="px-4 py-12 text-center text-sm text-[#6C757D]"
                      >
                        No configuration data. Click{" "}
                        <span className="font-medium text-[#4361EE]">Read Config</span> to
                        fetch from device.
                      </td>
                    </tr>
                  )}
                  {reading && getActiveGroupData().readRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={TABLE_COLUMNS.length + 1}
                        className="px-4 py-12 text-center"
                      >
                        <div className="flex items-center justify-center gap-2 text-sm text-[#6C757D]">
                          <Loader2 className="w-4 h-4 animate-spin text-[#4361EE]" />
                          Waiting for device response...
                        </div>
                      </td>
                    </tr>
                  )}
                  {getActiveGroupData().readRows.map((row, index) => (
                    <tr
                      key={index}
                      className="hover:bg-[#F8F9FA] transition-colors"
                    >
                      {TABLE_COLUMNS.map((col) => {
                        const cellValue = row[col.key] ?? "";

                        // Handle serial number column (read-only, auto-increment)
                        if (col.isSerial) {
                          return (
                            <td key={col.key} className={`${col.width} px-2 py-2 text-center`}>
                              <span className="text-sm text-[#212529] font-medium">{index + 1}</span>
                            </td>
                          );
                        }

                        if (col.key === "dataType") {
                          return (
                            <td key={col.key} className={`${col.width} px-2 py-2 text-center`}>
                              <select
                                value={cellValue}
                                onChange={(e) => updateCell(index, col.key, e.target.value)}
                                className="w-full bg-white border border-[#E9ECEF] focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] rounded-lg text-center [text-align-last:center] cursor-pointer"
                              >
                                <option value="Int">Int</option>
                                <option value="Float">Float</option>
                              </select>
                            </td>
                          );
                        }

                        if (col.key === "parity") {
                          return (
                            <td key={col.key} className={`${col.width} px-2 py-2 text-center`}>
                              <select
                                value={cellValue}
                                onChange={(e) => updateCell(index, col.key, e.target.value)}
                                className="w-full bg-white border border-[#E9ECEF] focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] font-mono text-center [text-align-last:center] rounded-lg cursor-pointer"
                              >
                                <option value="0">0 (None)</option>
                                <option value="1">1 (Even)</option>
                                <option value="2">2 (Odd)</option>
                              </select>
                            </td>
                          );
                        }

                        if (col.key === "stopBits") {
                          return (
                            <td key={col.key} className={`${col.width} px-2 py-2 text-center`}>
                              <select
                                value={cellValue}
                                onChange={(e) => updateCell(index, col.key, e.target.value)}
                                className="w-full bg-white border border-[#E9ECEF] focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] font-mono text-center [text-align-last:center] rounded-lg cursor-pointer"
                              >
                                <option value="1">1</option>
                                <option value="2">2</option>
                              </select>
                            </td>
                          );
                        }

                        if (col.key === "dataBits") {
                          return (
                            <td key={col.key} className={`${col.width} px-2 py-2 text-center`}>
                              <select
                                value={cellValue}
                                onChange={(e) => updateCell(index, col.key, e.target.value)}
                                className="w-full bg-white border border-[#E9ECEF] focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] font-mono text-center [text-align-last:center] rounded-lg cursor-pointer"
                              >
                                <option value="8">8</option>
                                <option value="7">7</option>
                              </select>
                            </td>
                          );
                        }

                        if (col.key === "functionCode") {
                          return (
                            <td key={col.key} className={`${col.width} px-2 py-2 text-center`}>
                              <select
                                value={cellValue}
                                onChange={(e) => updateCell(index, col.key, e.target.value)}
                                className="w-full bg-white border border-[#E9ECEF] focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] font-mono text-center [text-align-last:center] rounded-lg cursor-pointer"
                              >
                                <option value="1">1 (Coils)</option>
                                <option value="2">2 (Inputs)</option>
                                <option value="3">3 (Holding)</option>
                                <option value="4">4 (Input Reg)</option>
                                <option value="5">5 (Write Coil)</option>
                                <option value="6">6 (Write Reg)</option>
                                <option value="15">15 (Write Coils)</option>
                                <option value="16">16 (Write Regs)</option>
                              </select>
                            </td>
                          );
                        }

                        return (
                          <td key={col.key} className={`${col.width} px-2 py-2 text-center`}>
                            <input
                              type="text"
                              value={cellValue}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (col.type === "number") {
                                  // Allow integers, decimals, negative signs, and empty inputs during typing
                                  if (/^-?\d*\.?\d*$/.test(val)) {
                                    updateCell(index, col.key, val);
                                  }
                                } else {
                                  updateCell(index, col.key, val);
                                }
                              }}
                              className="w-full bg-white border border-[#E9ECEF] focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] rounded-lg text-center"
                            />
                          </td>
                        );
                      })}
                      <td className="w-16 px-2 py-2 text-center">
                        <button
                          onClick={() => removeRow(index)}
                          className="p-1.5 text-[#ADB5BD] hover:text-[#DC3545] hover:bg-[#FDECEE] rounded-lg transition-colors inline-flex items-center justify-center cursor-pointer"
                          title="Delete row"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add Row Button */}
            <div className="px-4 py-3 border-t border-[#E9ECEF]">
              <button
                onClick={addRow}
                disabled={getActiveGroupData().readRows.length >= PARAMETERS_PER_GROUP}
                className="inline-flex items-center gap-1.5 text-sm text-[#4361EE] hover:text-[#3A53D0] font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                Add Row
              </button>
              <span className="ml-4 text-xs text-[#6C757D]">
                {getActiveGroupData().readRows.length} / {PARAMETERS_PER_GROUP}
              </span>
              <div className="flex justify-end">
                <Button
                  onClick={handleReadConfig}
                  disabled={reading || !prefix}
                  className="h-10 px-5 bg-[#4361EE] hover:bg-[#3A53D0] text-white disabled:opacity-50 cursor-pointer"
                >
                  {reading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  <Eye className="w-4 h-4 mr-2" />
                  {reading
                    ? `Reading batch ${readProgress.current}/${readProgress.total}`
                    : "Read Config"}
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={getActiveGroupData().readRows.length === 0}
                  className="h-10 px-5 bg-[#4361EE] hover:bg-[#3A53D0] text-white disabled:opacity-50 cursor-pointer ml-2"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* WiFi & System Status Section */}
        {gateway.data && activeView === "wifi" && (
          <div className="mt-2 animate-fadeIn">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#212529] tracking-tight">
                WiFi & System Status
              </h2>
            </div>
            <div className="bg-white border border-[#E9ECEF] rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr className="bg-[#F8F9FA] border-b-2 border-[#E9ECEF]">
                      <th className="px-4 py-3 text-center text-xs font-semibold text-[#6C757D] uppercase tracking-wider">
                        Publish Config
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-[#6C757D] uppercase tracking-wider">
                        Read Config
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-[#6C757D] uppercase tracking-wider">
                        WiFi
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-[#6C757D] uppercase tracking-wider">
                        Location
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-[#6C757D] uppercase tracking-wider">
                        Delay
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9ECEF]">
                    {getActiveGroupData().wifiRows.length === 0 && !readingWifi && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-12 text-center text-sm text-[#6C757D]"
                        >
                          No WiFi status data. Click{" "}
                          <span className="font-medium text-[#4361EE]">Wifi</span> to fetch from device.
                        </td>
                      </tr>
                    )}
                    {readingWifi && getActiveGroupData().wifiRows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center">
                          <div className="flex items-center justify-center gap-2 text-sm text-[#6C757D]">
                            <Loader2 className="w-4 h-4 animate-spin text-[#4361EE]" />
                            Waiting for WiFi status response...
                          </div>
                        </td>
                      </tr>
                    )}
                    {getActiveGroupData().wifiRows.map((row, index) => (
                      <tr
                        key={index}
                        className="hover:bg-[#F8F9FA] transition-colors"
                      >
                        <td className="px-4 py-3 text-center text-sm text-[#212529] font-mono">
                          {row.publishConfig || "-"}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-[#212529] font-mono">
                          {row.readConfig || "-"}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-[#212529] font-mono">
                          {row.wifi || "-"}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-[#212529] font-mono">
                          {row.location || "-"}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-[#212529] font-mono">
                          {row.delay || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-[#E9ECEF] flex justify-end">
                <Button
                  onClick={handleSave}
                  disabled={getActiveGroupData().wifiRows.length === 0}
                  className="h-10 px-5 bg-[#4361EE] hover:bg-[#3A53D0] text-white disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </Button>
              </div>
            </div>
          </div>
        )}
        </div>
      </main>
    </div>
  );
}

