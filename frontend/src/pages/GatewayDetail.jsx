import { useState, useEffect, useCallback, useMemo } from "react";
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
  MapPin,
  Clock,
  FolderUp,
  FolderDown,
  BookOpen,
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
  address: "",
  length: 1,
  dataType: "Int",
  scaleFactor: 1,
  baudRate: 115200,
  serialFormat: "8N1",
  decimal: 0, // New field: 0 = none, 1 = 1 decimal, 2 = 2 decimals
};

// Helper function to get the next available parameter number
function getNextParameterNumber(rows) {
  if (rows.length === 0) return 1;

  // Extract all parameter numbers from existing rows
  const numbers = rows
    .map(row => {
      const match = row.parameterName?.match(/^P(\d+)$/);
      return match ? parseInt(match[1]) : 0;
    })
    .filter(num => num > 0);

  if (numbers.length === 0) return 1;

  // Find the maximum number and add 1
  return Math.max(...numbers) + 1;
}

// Only renumber when specifically needed (e.g., after import or conflict resolution)
function renumberRows(rows) {
  // Only renumber if there are gaps or duplicates in the numbering
  const numbers = rows
    .map(row => {
      const match = row.parameterName?.match(/^P(\d+)$/);
      return match ? parseInt(match[1]) : 0;
    })
    .filter(num => num > 0);

  if (numbers.length === 0) return rows;

  // Check if numbers are sequential starting from 1
  const sorted = [...numbers].sort((a, b) => a - b);
  let needsRenumber = false;

  // Check for duplicates or gaps
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] !== i + 1) {
      needsRenumber = true;
      break;
    }
  }

  if (!needsRenumber) return rows;

  // Renumber all rows sequentially
  return rows.map((row, i) => ({
    ...row,
    parameterName: `P${i + 1}`,
  }));
}

function resolveSlaveConflicts(rows) {
  const used = new Set();
  let changed = false;
  const updated = [...rows];

  let i = 0;
  while (i < updated.length) {
    const deviceName = updated[i]?.deviceName ?? "";
    let sid = Number(updated[i]?.slaveId) || 1;

    // Find the end of this consecutive device group
    let j = i;
    while (j < updated.length && updated[j]?.deviceName === deviceName) {
      j++;
    }

    // If this slave ID is already taken, pick the next free one
    if (used.has(sid)) {
      let next = 1;
      while (next <= 32 && used.has(next)) next++;
      sid = next <= 32 ? next : 1;
      changed = true;
    }
    used.add(sid);

    // Write the (possibly resolved) slaveId to all rows in this group
    for (let k = i; k < j; k++) {
      if (Number(updated[k]?.slaveId) !== sid) {
        updated[k] = { ...updated[k], slaveId: sid };
      }
    }

    i = j;
  }

  // If we changed slave IDs, we might need to renumber to avoid gaps
  // But we only renumber if absolutely necessary (duplicates or major gaps)
  if (changed) {
    // Check if renumbering is needed
    const numbers = updated
      .map(row => {
        const match = row.parameterName?.match(/^P(\d+)$/);
        return match ? parseInt(match[1]) : 0;
      })
      .filter(num => num > 0);

    if (numbers.length > 0) {
      const sorted = [...numbers].sort((a, b) => a - b);
      let needsRenumber = false;
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i] !== i + 1) {
          needsRenumber = true;
          break;
        }
      }
      if (needsRenumber) {
        return renumberRows(updated);
      }
    }
  }

  return updated;
}

function computeDeviceNameSpans(rows) {
  const spans = new Map();
  let i = 0;
  while (i < rows.length) {
    const name = rows[i]?.deviceName ?? "";
    let j = i + 1;
    while (j < rows.length && rows[j]?.deviceName === name) {
      j++;
    }
    spans.set(i, j - i);
    i = j;
  }
  return spans;
}

function computeSlaveIdSpans(rows) {
  const spans = new Map();
  let i = 0;
  while (i < rows.length) {
    const slaveId = rows[i]?.slaveId ?? "";
    let j = i + 1;
    while (j < rows.length && rows[j]?.slaveId === slaveId) {
      j++;
    }
    spans.set(i, j - i);
    i = j;
  }
  return spans;
}

const TABLE_COLUMNS = [
  { key: "deviceName", label: "Device Name", type: "text", width: "w-5" },
  { key: "slaveId", label: "Slave ID", type: "number", width: "w-20" },
  {
    key: "parameterName",
    label: "Parameter Name",
    type: "text",
    width: "w-24",
  },
  { key: "unit", label: "Unit", type: "text", width: "w-20" },
  { key: "functionCode", label: "Func Code", type: "number", width: "w-22" },
  { key: "address", label: "Address", type: "number", width: "w-20" },
  { key: "length", label: "Length", type: "number", width: "w-16" },
  { key: "dataType", label: "Data Type", type: "text", width: "w-24" },
  { key: "scaleFactor", label: "Scale", type: "number", width: "w-16" },
  { key: "decimal", label: "Decimal", type: "number", width: "w-16" },
  { key: "baudRate", label: "Baud Rate", type: "number", width: "w-24" },
  { key: "serialFormat", label: "Serial Format", type: "text", width: "w-20" },
];

const SERIAL_FORMAT_OPTIONS = [
  { value: "5N1", label: "5N1 - 5 data bits, No parity, 1 stop bit" },
  { value: "6N1", label: "6N1 - 6 data bits, No parity, 1 stop bit" },
  { value: "7N1", label: "7N1 - 7 data bits, No parity, 1 stop bit" },
  {
    value: "8N1",
    label: "8N1 - 8 data bits, No parity, 1 stop bit (most common)",
  },
  { value: "5E1", label: "5E1 - 5 data bits, Even parity, 1 stop bit" },
  { value: "6E1", label: "6E1 - 6 data bits, Even parity, 1 stop bit" },
  { value: "7E1", label: "7E1 - 7 data bits, Even parity, 1 stop bit" },
  { value: "8E1", label: "8E1 - 8 data bits, Even parity, 1 stop bit" },
  { value: "5O1", label: "5O1 - 5 data bits, Odd parity, 1 stop bit" },
  { value: "6O1", label: "6O1 - 6 data bits, Odd parity, 1 stop bit" },
  { value: "7O1", label: "7O1 - 7 data bits, Odd parity, 1 stop bit" },
  { value: "8O1", label: "8O1 - 8 data bits, Odd parity, 1 stop bit" },
  { value: "5M1", label: "5M1 - 5 data bits, Mark parity, 1 stop bit" },
  { value: "6M1", label: "6M1 - 6 data bits, Mark parity, 1 stop bit" },
  { value: "7M1", label: "7M1 - 7 data bits, Mark parity, 1 stop bit" },
  { value: "8M1", label: "8M1 - 8 data bits, Mark parity, 1 stop bit" },
  { value: "5S1", label: "5S1 - 5 data bits, Space parity, 1 stop bit" },
  { value: "6S1", label: "6S1 - 6 data bits, Space parity, 1 stop bit" },
  { value: "7S1", label: "7S1 - 7 data bits, Space parity, 1 stop bit" },
  { value: "8S1", label: "8S1 - 8 data bits, Space parity, 1 stop bit" },
  { value: "5N2", label: "5N2 - 5 data bits, No parity, 2 stop bits" },
  { value: "6N2", label: "6N2 - 6 data bits, No parity, 2 stop bits" },
  { value: "7N2", label: "7N2 - 7 data bits, No parity, 2 stop bits" },
  { value: "8N2", label: "8N2 - 8 data bits, No parity, 2 stop bits" },
  { value: "5E2", label: "5E2 - 5 data bits, Even parity, 2 stop bits" },
  { value: "6E2", label: "6E2 - 6 data bits, Even parity, 2 stop bits" },
  { value: "7E2", label: "7E2 - 7 data bits, Even parity, 2 stop bits" },
  { value: "8E2", label: "8E2 - 8 data bits, Even parity, 2 stop bits" },
  { value: "5O2", label: "5O2 - 5 data bits, Odd parity, 2 stop bits" },
  { value: "6O2", label: "6O2 - 6 data bits, Odd parity, 2 stop bits" },
  { value: "7O2", label: "7O2 - 7 data bits, Odd parity, 2 stop bits" },
  { value: "8O2", label: "8O2 - 8 data bits, Odd parity, 2 stop bits" },
  { value: "5M2", label: "5M2 - 5 data bits, Mark parity, 2 stop bits" },
  { value: "6M2", label: "6M2 - 6 data bits, Mark parity, 2 stop bits" },
  { value: "7M2", label: "7M2 - 7 data bits, Mark parity, 2 stop bits" },
  { value: "8M2", label: "8M2 - 8 data bits, Mark parity, 2 stop bits" },
  { value: "5S2", label: "5S2 - 5 data bits, Space parity, 2 stop bits" },
  { value: "6S2", label: "6S2 - 6 data bits, Space parity, 2 stop bits" },
  { value: "7S2", label: "7S2 - 7 data bits, Space parity, 2 stop bits" },
  { value: "8S2", label: "8S2 - 8 data bits, Space parity, 2 stop bits" },
];

const BAUD_RATE_OPTIONS = [
  { value: 110, label: "110" },
  { value: 300, label: "300" },
  { value: 600, label: "600" },
  { value: 1200, label: "1200" },
  { value: 2400, label: "2400" },
  { value: 4800, label: "4800" },
  { value: 9600, label: "9600" },
  { value: 14400, label: "14400" },
  { value: 19200, label: "19200" },
  { value: 38400, label: "38400" },
  { value: 57600, label: "57600" },
  { value: 115200, label: "115200" },
  { value: 230400, label: "230400" },
  { value: 460800, label: "460800" },
  { value: 921600, label: "921600" },
];

function serialFormatToComponents(serialFormat) {
  const dataBits = parseInt(serialFormat.charAt(0));
  const parityChar = serialFormat.charAt(1).toUpperCase();
  const stopBits = parseInt(serialFormat.charAt(2));

  let parity = 0;
  if (parityChar === "E") parity = 1;
  if (parityChar === "O") parity = 2;
  if (parityChar === "M") parity = 3;
  if (parityChar === "S") parity = 4;

  return { dataBits, parity, stopBits };
}

function componentsToSerialFormat(dataBits, parity, stopBits) {
  const parityMap = { 0: "N", 1: "E", 2: "O", 3: "M", 4: "S" };
  const parityChar = parityMap[parity] || "N";
  return `${dataBits}${parityChar}${stopBits}`;
}

export default function GatewayDetail() {
  const { companyId, gatewayId } = useParams();

  const gateway = trpc.gateway.get.useQuery(
    { id: gatewayId },
    { enabled: !!gatewayId }
  );

  const prefix = gateway.data?.prefix ?? null;

  // SSE connection for this gateway
  const {
    messages,
    connected: sseConnected,
    clearMessages,
  } = useGatewaySSE(prefix);

  // Group configuration
  const GROUPS_COUNT = 5;
  const PARAMETERS_PER_GROUP = 200;

  // Active group state (0-4, default to 0)
  const [activeGroup, setActiveGroup] = useState(0);

  // Enabled groups state (array of booleans, first group enabled by default)
  const [enabledGroups, setEnabledGroups] = useState([
    true,
    false,
    false,
    false,
    false,
  ]);

  // Config rows state per group
  const [groupData, setGroupData] = useState(
    Array.from({ length: GROUPS_COUNT }, () => ({
      publishRows: [],
      readRows: [],
    }))
  );

  // Active view state ("publish" | "read" | "wifi")
  const [activeView, setActiveView] = useState("publish");

  // Validation error state
  const [validationErrors, setValidationErrors] = useState([]);

  // Merge dialog state
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeData, setMergeData] = useState(null);

  // Add beforeunload event listener to warn user before leaving
  useEffect(() => {
    const handleBeforeUnload = e => {
      e.preventDefault();
      e.returnValue = ""; // Chrome requires returnValue to be set
      return ""; // For other browsers
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  // UI states
  const [publishing, setPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [publishProgress, setPublishProgress] = useState({
    current: 0,
    total: 0,
  });
  const [reading, setReading] = useState(false);
  const [readProgress, setReadProgress] = useState({ current: 0, total: 0 });
  const [showLiveBanner, setShowLiveBanner] = useState(false);

  const [readingWifi, setReadingWifi] = useState(false);
  const [showWifiLiveBanner, setShowWifiLiveBanner] = useState(false);
  const [readingLocation, setReadingLocation] = useState(false);
  const [showLocationLiveBanner, setShowLocationLiveBanner] = useState(false);
  const [readingDelay, setReadingDelay] = useState(false);
  const [showDelayLiveBanner, setShowDelayLiveBanner] = useState(false);

  const [wifiResponse, setWifiResponse] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [locationResponse, setLocationResponse] = useState("");
  const [delayInput, setDelayInput] = useState("");
  const [delayResponse, setDelayResponse] = useState("");

  const [testStatus, setTestStatus] = useState(null);
  const [testing, setTesting] = useState(false);

  const publishMutation = trpc.mqtt.publish.useMutation();

  // Helper functions to get/set data for active group
  const getActiveGroupData = () => groupData[activeGroup];
  const updateActiveGroupData = updater => {
    setGroupData(prev => {
      const newData = [...prev];
      const updatedGroup = updater(newData[activeGroup]);

      // Apply slave conflict resolution but DO NOT auto-renumber on every update
      if (updatedGroup.publishRows) {
        updatedGroup.publishRows = resolveSlaveConflicts(
          updatedGroup.publishRows
        );
      }

      if (updatedGroup.readRows) {
        updatedGroup.readRows = resolveSlaveConflicts(updatedGroup.readRows);
      }

      newData[activeGroup] = updatedGroup;
      return newData;
    });
  };

  // Get unique dropdown options dynamically for deviceName and slaveId
  const activeData = getActiveGroupData();
  const currentRows =
    activeView === "publish" ? activeData.publishRows : activeData.readRows;
  const deviceOptions = [
    ...new Set(currentRows.map(r => r.deviceName).filter(Boolean)),
  ];
  const slaveOptions = [
    ...new Set(currentRows.map(r => r.slaveId).filter(Boolean)),
  ];

  // Computed device name row spans (consecutive same device names merge)
  const deviceNameSpans = useMemo(
    () => computeDeviceNameSpans(currentRows),
    [currentRows]
  );

  // Computed slave ID row spans (consecutive same slave IDs merge)
  const slaveIdSpans = useMemo(
    () => computeSlaveIdSpans(currentRows),
    [currentRows]
  );

  // Check if device name already exists in the current view
  const checkDuplicateDeviceName = (deviceName, currentIndex) => {
    if (!deviceName || !deviceName.trim()) return null;

    const rows =
      activeView === "publish" ? activeData.publishRows : activeData.readRows;

    // Find if this device name exists in any other row
    for (let i = 0; i < rows.length; i++) {
      if (i === currentIndex) continue; // Skip the current row being edited

      const existingDeviceName = rows[i]?.deviceName?.trim();
      if (existingDeviceName === deviceName.trim()) {
        // Found a duplicate
        return {
          existingIndex: i,
          existingDevice: existingDeviceName,
          existingRows: rows.filter(
            (r, idx) => r.deviceName?.trim() === deviceName.trim()
          ),
        };
      }
    }

    return null;
  };

  // Function to handle merging device data
  const mergeDevices = (currentIndex, deviceName) => {
    const rows =
      activeView === "publish" ? activeData.publishRows : activeData.readRows;

    // Find all rows with the duplicate device name
    const duplicateRows = rows.filter(
      (r, idx) =>
        r.deviceName?.trim() === deviceName.trim() && idx !== currentIndex
    );

    // Update all rows to use the merged device name
    updateActiveGroupData(prev => {
      let updatedRows;
      if (activeView === "publish") {
        updatedRows = [...prev.publishRows];
      } else {
        updatedRows = [...prev.readRows];
      }

      // Update all rows in the current group to use the merged device name
      const currentDeviceName = updatedRows[currentIndex]?.deviceName?.trim();
      updatedRows = updatedRows.map((row, idx) => {
        if (
          row.deviceName?.trim() === currentDeviceName ||
          idx === currentIndex
        ) {
          return { ...row, deviceName: deviceName.trim() };
        }
        return row;
      });

      // Apply slave conflict resolution and return
      const resolvedRows = resolveSlaveConflicts(updatedRows);

      if (activeView === "publish") {
        return { ...prev, publishRows: resolvedRows };
      } else {
        return { ...prev, readRows: resolvedRows };
      }
    });
  };

  // Handle incoming SSE messages (ReadConfig & Wifi responses)
  useEffect(() => {
    if (messages.length === 0) return;

    const latestMessage = messages[messages.length - 1];
    if (latestMessage.type === "message" && latestMessage.payload) {
      const payload = latestMessage.payload.trim();
      const topic = latestMessage.topic || "";

      // 1. Modbus Config response (ends with /readconfig/res or /Readconfig/G{group}/res)
      if (
        topic.endsWith("/readconfig/res") ||
        topic.match(/\/readconfig\/g\d+\/res$/i)
      ) {
        // Extract group number from topic if present (e.g., /Readconfig/G1/res -> group 0)
        const groupMatch = topic.match(/\/g(\d+)\/res$/i);
        const responseGroup = groupMatch
          ? parseInt(groupMatch[1]) - 1
          : activeGroup;

        setActiveView("read");
        try {
          let parsedRows = [];

          // Option 1: Parse as JSON array
          if (payload.startsWith("[") && payload.endsWith("]")) {
            const parsed = JSON.parse(payload);
            if (Array.isArray(parsed)) {
              parsedRows = parsed.map(r => {
                const dataBits = Number(r.dataBits ?? 8);
                const parity = Number(r.parity ?? 0);
                const stopBits = Number(r.stopBits ?? 1);
                const serialFormat = componentsToSerialFormat(
                  dataBits,
                  parity,
                  stopBits
                );

                return {
                  parameterName: String(r.parameterName ?? ""),
                  deviceName: String(r.deviceName ?? ""),
                  unit: String(r.unit ?? ""),
                  slaveId: Number(r.slaveId ?? 1),
                  functionCode: Number(r.functionCode ?? 3),
                  address: Number(r.address ?? 0),
                  length: Number(r.length ?? 1),
                  dataType: String(r.dataType ?? "Float"),
                  scaleFactor: Number(r.scaleFactor ?? 1),
                  decimal: Number(r.decimal ?? 0),
                  baudRate: Number(r.baudRate ?? 115200),
                  serialFormat: serialFormat,
                };
              });
            }
          }

          // Option 2: Parse as flat comma-separated list of quoted values with colon separator
          if (payload.startsWith('"') && payload.endsWith('"')) {
            // Split by colon to get individual parameters
            const parameters = payload.split(":");

            parameters.forEach(paramStr => {
              // Remove outer quotes if present
              const cleanStr =
                paramStr.startsWith('"') && paramStr.endsWith('"')
                  ? paramStr.slice(1, -1)
                  : paramStr;

              const items = cleanStr.split('","');

              if (items.length === 12) {
                // 12 values per parameter (13 fields total including decimal)
                const param = items[0];
                const device = items[1];
                const unit = items[2];
                const slave = Number(items[3]) || 1;
                const func = Number(items[4]) || 3;
                const addr = Number(items[5]) || 0;
                const len = Number(items[6]) || 1;

                let dType = items[7];
                if (dType.toLowerCase() === "int") dType = "Int";
                if (dType.toLowerCase() === "float") dType = "Float";

                const scale = Number(items[8]) || 1.0;
                const decimal = Number(items[9]) || 0;
                const baud = Number(items[10]) || 9600;

                // Serial format is now a single string (e.g., "8N1")
                const serialFormat = items[11] || "8N1";

                parsedRows.push({
                  parameterName: param,
                  deviceName: device,
                  unit: unit,
                  slaveId: slave,
                  functionCode: func,
                  address: addr,
                  length: len,
                  dataType: dType,
                  scaleFactor: scale,
                  decimal: decimal,
                  baudRate: baud,
                  serialFormat: serialFormat,
                });
              }
            });
          }

          // Append batch data to existing readRows for the specific group
          if (parsedRows.length > 0) {
            setGroupData(prev => {
              const newData = [...prev];
              newData[responseGroup] = {
                ...newData[responseGroup],
                readRows: [...newData[responseGroup].readRows, ...parsedRows],
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

      // 2. Wifi response (ends with /Wifi/res)
      if (topic.endsWith("/Wifi/res")) {
        setActiveView("wifi");
        setReadingWifi(false);
        setWifiResponse(payload);
        setShowWifiLiveBanner(true);
      }

      // 3. Location response (ends with /ReadLocationdetails/res)
      if (topic.endsWith("/ReadLocationdetails/res")) {
        setActiveView("location");
        setReadingLocation(false);
        setLocationResponse(payload);
        setShowLocationLiveBanner(true);
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
    if (
      reading &&
      readProgress.current > 0 &&
      readProgress.current === readProgress.total
    ) {
      // All batches have been sent, wait a bit for responses then stop reading
      const timeout = setTimeout(() => {
        setReading(false);
        setReadProgress({ current: 0, total: 0 });

        // Auto-enable and switch to next group after completing current group
        const nextGroup = activeGroup + 1;
        if (nextGroup < GROUPS_COUNT) {
          setEnabledGroups(prev => {
            const newEnabled = [...prev];
            newEnabled[nextGroup] = true;
            return newEnabled;
          });
          setActiveGroup(nextGroup);
        }
      }, 3000); // Wait 3 seconds for all responses to arrive

      return () => clearTimeout(timeout);
    }
  }, [readProgress, reading, activeGroup]);

  // Add a new row
  const addRow = useCallback(() => {
    updateActiveGroupData(prev => {
      const rows = activeView === "publish" ? prev.publishRows : prev.readRows;
      const maxParams = PARAMETERS_PER_GROUP;

      if (rows.length >= maxParams) {
        toast.error(`Maximum ${maxParams} parameters allowed per group`);
        return prev;
      }

      const nextNumber = getNextParameterNumber(rows);
      const newParameterName = `P${nextNumber}`;
      const newRow = { ...EMPTY_ROW, parameterName: newParameterName };

      if (activeView === "publish") {
        return { ...prev, publishRows: [...prev.publishRows, newRow] };
      } else if (activeView === "read") {
        return { ...prev, readRows: [...prev.readRows, newRow] };
      }
      return prev;
    });
  }, [activeView, updateActiveGroupData]);

  // Add a new row with the same device name as the current row
  const addRowWithDevice = useCallback(
    index => {
      updateActiveGroupData(prev => {
        let rows;
        if (activeView === "publish") {
          rows = prev.publishRows;
          if (rows.length >= PARAMETERS_PER_GROUP) {
            toast.error(
              `Maximum ${PARAMETERS_PER_GROUP} parameters allowed per group`
            );
            return prev;
          }
        } else if (activeView === "read") {
          rows = prev.readRows;
          if (rows.length >= PARAMETERS_PER_GROUP) {
            toast.error(
              `Maximum ${PARAMETERS_PER_GROUP} parameters allowed per group`
            );
            return prev;
          }
        } else {
          return prev;
        }

        const currentDevice = rows[index]?.deviceName || "";
        const slaveId = rows[index]?.slaveId || 1;

        // Get the next available parameter number globally
        const nextNumber = getNextParameterNumber(rows);
        const newParameterName = `P${nextNumber}`;

        const newRow = {
          ...EMPTY_ROW,
          parameterName: newParameterName,
          deviceName: currentDevice,
          slaveId: slaveId,
        };

        // Insert after the current row
        const newRows = [...rows];
        newRows.splice(index + 1, 0, newRow);

        if (activeView === "publish") {
          return { ...prev, publishRows: newRows };
        } else {
          return { ...prev, readRows: newRows };
        }
      });
    },
    [activeView, updateActiveGroupData]
  );

  // Add a new row to a specific device group (inserts after the group's last row)
  const addRowToDevice = useCallback(
    startIndex => {
      updateActiveGroupData(prev => {
        let rows;
        if (activeView === "publish") {
          rows = prev.publishRows;
          if (rows.length >= PARAMETERS_PER_GROUP) {
            toast.error(
              `Maximum ${PARAMETERS_PER_GROUP} parameters allowed per group`
            );
            return prev;
          }
        } else if (activeView === "read") {
          rows = prev.readRows;
          if (rows.length >= PARAMETERS_PER_GROUP) {
            toast.error(
              `Maximum ${PARAMETERS_PER_GROUP} parameters allowed per group`
            );
            return prev;
          }
        } else {
          return prev;
        }

        const deviceName = rows[startIndex]?.deviceName || "";
        const slaveId = rows[startIndex]?.slaveId || 1;

        // Find end of this consecutive group
        let end = startIndex;
        while (
          end + 1 < rows.length &&
          rows[end + 1]?.deviceName === deviceName
        ) {
          end++;
        }

        // Get the next available parameter number globally
        const nextNumber = getNextParameterNumber(rows);
        const newParameterName = `P${nextNumber}`;

        const newRow = {
          ...EMPTY_ROW,
          parameterName: newParameterName,
          deviceName: deviceName,
          slaveId: slaveId,
        };

        const newRows = [
          ...rows.slice(0, end + 1),
          newRow,
          ...rows.slice(end + 1),
        ];

        if (activeView === "publish") {
          return { ...prev, publishRows: newRows };
        } else {
          return { ...prev, readRows: newRows };
        }
      });
    },
    [activeView, updateActiveGroupData]
  );

  // Remove a row - DOES NOT renumber
  const removeRow = useCallback(
    index => {
      updateActiveGroupData(prev => {
        if (activeView === "publish") {
          // Just remove the row, don't renumber
          const newRows = prev.publishRows.filter((_, i) => i !== index);
          return {
            ...prev,
            publishRows: newRows,
          };
        } else if (activeView === "read") {
          const newRows = prev.readRows.filter((_, i) => i !== index);
          return {
            ...prev,
            readRows: newRows,
          };
        }
        return prev;
      });
    },
    [activeView, updateActiveGroupData]
  );

  // Update a cell value
  const updateCell = useCallback(
    (index, key, value) => {
      updateActiveGroupData(prev => {
        let updated;
        let rows;

        if (activeView === "publish") {
          updated = [...prev.publishRows];
          rows = prev.publishRows;
        } else if (activeView === "read") {
          updated = [...prev.readRows];
          rows = prev.readRows;
        } else {
          return prev;
        }

        // Sync device name / slave ID change across all rows in the consecutive group
        if (key === "deviceName" || key === "slaveId") {
          const oldVal = updated[index]?.[key];
          if (String(oldVal) === value) return prev;

          // Find start of this consecutive group
          let start = index;
          while (
            start > 0 &&
            updated[start - 1]?.deviceName === updated[index]?.deviceName
          ) {
            start--;
          }
          // Find end of this consecutive group
          let end = index;
          while (
            end + 1 < updated.length &&
            updated[end + 1]?.deviceName === updated[index]?.deviceName
          ) {
            end++;
          }
          // Update all rows in the group
          for (let i = start; i <= end; i++) {
            updated[i] = { ...updated[i], [key]: value };
          }
        } else {
          const row = { ...updated[index] };
          row[key] = value;
          updated[index] = row;
        }

        // Auto-fill logic: If dataType changed → auto-set length (Int=1, Float=2)
        if (key === "dataType") {
          const dataTypeLower = String(value).toLowerCase();
          if (dataTypeLower === "int") {
            updated[index].length = 1;
          } else if (dataTypeLower === "float") {
            updated[index].length = 2;
          }
        }

        if (activeView === "publish") {
          return { ...prev, publishRows: updated };
        } else {
          return { ...prev, readRows: updated };
        }
      });
    },
    [activeView, updateActiveGroupData]
  );

  // Helper function to create batches based on the pattern: 200, 200, 200, 200, 200, then repeat
  const createBatches = totalItems => {
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
        size: endIndex - currentIndex,
      });
      currentIndex = endIndex;
      patternIndex++;
    }

    return batches;
  };

  // Validate rows before publishing
  const validateRows = rows => {
    const errors = [];
    const deviceGroups = {};

    rows.forEach((row, index) => {
      const rowNumber = index + 1;
      const deviceName = row.deviceName?.trim() || "";
      const parameterName = row.parameterName?.trim() || "";
      const slaveId = row.slaveId;
      const address = row.address;
      const functionCode = row.functionCode;

      // Check for missing device name
      if (!deviceName) {
        errors.push({
          row: rowNumber,
          parameter: parameterName || `Row ${rowNumber}`,
          field: "deviceName",
          message: `Device Name is missing`,
        });
      } else if (deviceName.length > 15) {
        errors.push({
          row: rowNumber,
          parameter: parameterName || `Row ${rowNumber}`,
          field: "deviceName",
          message: `Device Name "${deviceName}" exceeds 15 characters (${deviceName.length})`,
        });
      }

      // Check for missing parameter name
      if (!parameterName) {
        errors.push({
          row: rowNumber,
          parameter: `Row ${rowNumber}`,
          field: "parameterName",
          message: `Parameter Name is missing`,
        });
      }

      // Check for missing slave ID
      if (!slaveId || slaveId === "") {
        errors.push({
          row: rowNumber,
          parameter: parameterName || `Row ${rowNumber}`,
          field: "slaveId",
          message: `Slave ID is missing`,
        });
      }

      // Check for missing address
      if (address === undefined || address === null || address === "") {
        errors.push({
          row: rowNumber,
          parameter: parameterName || `Row ${rowNumber}`,
          field: "address",
          message: `Address is missing`,
        });
      }

      // Check for missing function code
      if (!functionCode || functionCode === "") {
        errors.push({
          row: rowNumber,
          parameter: parameterName || `Row ${rowNumber}`,
          field: "functionCode",
          message: `Function Code is missing`,
        });
      }

      // Group errors by device name
      if (deviceName) {
        if (!deviceGroups[deviceName]) {
          deviceGroups[deviceName] = [];
        }
        deviceGroups[deviceName].push(rowNumber);
      }
    });

    return { errors, deviceGroups };
  };

  // Publish Config (Setconfig) - Batch-wise publishing for active group
  const handlePublish = async () => {
    if (!prefix) return;
    const activeData = getActiveGroupData();
    if (activeData.publishRows.length === 0) {
      toast.error("No data to publish");
      return;
    }

    // Validate rows
    const { errors, deviceGroups } = validateRows(activeData.publishRows);

    if (errors.length > 0) {
      setValidationErrors(errors);

      // Create error message with details
      let errorMessage = `❌ Validation failed: ${errors.length} error(s) found.\n\n`;
      errorMessage += "═".repeat(60) + "\n";
      errorMessage += "│ #  │ Parameter      │ Field         │ Message\n";
      errorMessage += "═".repeat(60) + "\n";

      errors.forEach(err => {
        const rowStr = String(err.row).padStart(3);
        const paramStr = (err.parameter || "").padEnd(14).slice(0, 14);
        const fieldStr = err.field.padEnd(14).slice(0, 14);
        const messageStr = err.message.slice(0, 25);
        errorMessage += `│ ${rowStr} │ ${paramStr} │ ${fieldStr} │ ${messageStr}\n`;
      });

      errorMessage += "═".repeat(60) + "\n\n";

      // Show device summary
      errorMessage += "📊 Device Summary:\n";
      Object.keys(deviceGroups).forEach(device => {
        const count = deviceGroups[device].length;
        errorMessage += `  • ${device}: ${count} parameter(s)\n`;
      });

      // Show in toast with long duration
      toast.error(
        <div className="whitespace-pre-wrap font-mono text-xs">
          {errorMessage}
        </div>,
        { duration: 10000 }
      );

      return;
    }

    // Clear validation errors if no errors
    setValidationErrors([]);

    setActiveView("publish");
    setPublishing(true);
    setPublishSuccess(false);

    // Map each row into a flat list of 13 formatted string fields
    const getRowValues = r => {
      const param = String(r.parameterName || "").trim();
      const device = String(r.deviceName || "").trim();
      const unit = String(r.unit || "").trim();
      const slave = String(parseInt(String(r.slaveId), 10) || 0);
      const func = String(parseInt(String(r.functionCode), 10) || 3);
      const addr = String(parseInt(String(r.address), 10) || 0);
      const len = String(parseInt(String(r.length), 10) || 1);
      const dType = String(r.dataType || "Float").toLowerCase();
      const scale = String(parseFloat(String(r.scaleFactor)) || 1.0);
      const decimal = String(parseInt(String(r.decimal), 10) || 0);
      const baud = String(parseInt(String(r.baudRate), 10) || 115200);

      // Get the serial format as a single string (e.g., "8N1")
      const serialFormat = String(r.serialFormat || "8N1");

      return [
        param,
        device,
        unit,
        slave,
        func,
        addr,
        len,
        dType,
        scale,
        decimal,
        baud,
        serialFormat,
      ];
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

        // Build the payload with colon separator between parameters
        const parameterStrings = [];
        batchRows.forEach(row => {
          const rowValues = getRowValues(row);
          // Join each parameter's values with commas
          const paramString = rowValues.map(v => `"${v}"`).join(",");
          parameterStrings.push(paramString);
        });

        // Join parameters with colon
        const payloadString = parameterStrings.join(":");

        await publishMutation.mutateAsync({
          topic: `${prefix}/Setconfig/G${activeGroup + 1}`,
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
      toast.success(
        `✅ Successfully published ${rowsToPublish.length} parameters to Group ${activeGroup + 1}`
      );
      setTimeout(() => setPublishSuccess(false), 2000);

      // Auto-enable and switch to next group after completing current group
      const nextGroup = activeGroup + 1;
      if (nextGroup < GROUPS_COUNT) {
        setEnabledGroups(prev => {
          const newEnabled = [...prev];
          newEnabled[nextGroup] = true;
          return newEnabled;
        });
        setActiveGroup(nextGroup);
      }
    } catch (err) {
      console.error("Publish failed:", err);
      toast.error("Failed to publish configuration");
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
          topic: `${prefix}/Readconfig/G${activeGroup + 1}`,
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

  // Read WiFi (trigger Wifi → subscribe to Wifi/res)
  const handleReadWifi = async () => {
    if (!prefix) return;
    setActiveView("wifi");
    setReadingWifi(true);
    setShowWifiLiveBanner(true);
    setWifiResponse("");

    try {
      await publishMutation.mutateAsync({
        topic: `${prefix}/Wifi`,
        payload: "1",
      });
    } catch (err) {
      console.error("Wifi trigger failed:", err);
      setReadingWifi(false);
    }
  };

  // Set Location
  const handleSetLocation = async () => {
    if (!prefix) {
      const length = locationInput.length <= 15;
      if (!length) {
        toast.error("Location name must be less than 15 characters");
        return;
      }
      toast.error("Gateway prefix not available");
      return;
    }

    if (!locationInput) {
      toast.error("Please enter location name");
      return;
    }

    try {
      await publishMutation.mutateAsync({
        topic: `${prefix}/SetLocation`,
        payload: locationInput,
      });

      toast.success("Location set successfully");
      setLocationInput("");
    } catch (err) {
      console.error("Failed to set location:", err);
      toast.error("Failed to set location");
    }
  };

  // Read Location
  const handleReadLocation = async () => {
    if (!prefix) return;
    setActiveView("location");
    setReadingLocation(true);
    setShowLocationLiveBanner(true);
    setLocationResponse("");

    try {
      await publishMutation.mutateAsync({
        topic: `${prefix}/ReadLocationdetails`,
        payload: "1",
      });
    } catch (err) {
      console.error("Read location failed:", err);
      setReadingLocation(false);
    }
  };

  // Set Delay
  const handleSetDelay = async () => {
    if (!prefix) {
      toast.error("Gateway prefix not available");
      return;
    }

    if (!delayInput) {
      toast.error("Please enter delay value");
      return;
    }

    try {
      await publishMutation.mutateAsync({
        topic: `${prefix}/Delay`,
        payload: delayInput,
      });

      toast.success("Delay set successfully");
      setDelayInput("");
    } catch (err) {
      console.error("Failed to set delay:", err);
      toast.error("Failed to set delay");
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
      fileName = `${prefix}_G${activeGroup + 1}_publish_config.xlsx`;
    } else if (activeView === "read") {
      data = activeData.readRows;
      fileName = `${prefix}_G${activeGroup + 1}_read_config.xlsx`;
    } else {
      return;
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
  const handleImport = e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
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
          toast.warning(
            `Excel file contains ${jsonData.length} rows, but only ${PARAMETERS_PER_GROUP} will be imported (maximum per group)`
          );
        }

        // Validate and transform data based on active view
        if (activeView === "publish" || activeView === "read") {
          const validRows = jsonData.map(row => {
            // Try to get serialFormat first, otherwise construct from individual components
            let serialFormat = String(
              row.serialFormat || row.SerialFormat || "8N1"
            );

            // If serialFormat is not in the expected format, try to construct from individual components
            if (!/^[5-8][NEOMS][12]$/.test(serialFormat)) {
              const dataBits = Number(row.dataBits || row.DataBits || 8);
              const parity = Number(row.parity || row.Parity || 0);
              const stopBits = Number(row.stopBits || row.StopBits || 1);
              serialFormat = componentsToSerialFormat(
                dataBits,
                parity,
                stopBits
              );
            }

            return {
              parameterName: String(
                row.parameterName || row.ParameterName || ""
              ),
              deviceName: String(row.deviceName || row.DeviceName || ""),
              unit: String(row.unit || row.Unit || ""),
              slaveId: Number(row.slaveId || row.SlaveId || 1),
              functionCode: Number(row.functionCode || row.FunctionCode || 3),
              address: Number(row.address || row.Address || 0),
              length: Number(row.length || row.Length || 1),
              dataType: String(row.dataType || row.DataType || "Int"),
              scaleFactor: Number(row.scaleFactor || row.ScaleFactor || 1),
              decimal: Number(row.decimal || row.Decimal || 0),
              baudRate: Number(row.baudRate || row.BaudRate || 9600),
              serialFormat: serialFormat,
            };
          });

          // Limit to PARAMETERS_PER_GROUP
          const limitedRows = validRows.slice(0, PARAMETERS_PER_GROUP);

          if (activeView === "publish") {
            updateActiveGroupData(prev => ({
              ...prev,
              publishRows: limitedRows,
            }));
          } else {
            updateActiveGroupData(prev => ({ ...prev, readRows: limitedRows }));
          }
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
              {
                label: gateway.data.company.name,
                to: `/companies/${companyId}`,
              },
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
              <span
                className={`text-sm font-medium ${
                  testStatus === "connected" ? "text-green-600" : "text-red-600"
                }`}
              >
                {testStatus === "connected" ? "✓ Connected" : "✗ Disconnected"}
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end mt-6"></div>

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
                <NotebookPen className="w-4 h-4 mr-2 inline text-[#4361EE]" />
                Write
              </button>

              <button
                onClick={() => setActiveView("read")}
                className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  activeView === "read"
                    ? "text-[#4361EE] border-b-2 border-[#4361EE] -mb-[1px]"
                    : "text-[#6C757D] hover:text-[#212529]"
                }`}
              >
                <BookOpen className="w-4 h-4 mr-2 inline text-[#4361EE]" />
                Read
              </button>

              <button
                onClick={() => setActiveView("wifi")}
                className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  activeView === "wifi"
                    ? "text-[#4361EE] border-b-2 border-[#4361EE] -mb-[1px]"
                    : "text-[#6C757D] hover:text-[#212529]"
                }`}
              >
                <Wifi className="w-4 h-4 mr-2 inline text-[#4361EE]" />
                WiFi
              </button>

              <button
                onClick={() => setActiveView("location")}
                className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  activeView === "location"
                    ? "text-[#4361EE] border-b-2 border-[#4361EE] -mb-[1px]"
                    : "text-[#6C757D] hover:text-[#212529]"
                }`}
              >
                <MapPin className="w-4 h-4 mr-2 inline text-[#4361EE]" />
                Location
              </button>

              <button
                onClick={() => setActiveView("delay")}
                className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  activeView === "delay"
                    ? "text-[#4361EE] border-b-2 border-[#4361EE] -mb-[1px]"
                    : "text-[#6C757D] hover:text-[#212529]"
                }`}
              >
                <Clock className="w-4 h-4 mr-2 inline text-[#4361EE]" />
                Delay
              </button>
            </div>

            {/* Right Side Import Button */}
            {activeView !== "wifi" &&
              activeView !== "location" &&
              activeView !== "delay" && (
                <>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleImport}
                    className="hidden"
                    id="import-file-input"
                  />
                  <div className="flex">
                    <Button
                      variant="outline"
                      className="border-[#4361EE] text-[#4361EE] cursor-pointer"
                      onClick={() =>
                        document.getElementById("import-file-input").click()
                      }
                    >
                      <FolderDown className="w-4 h-4 mr-2" />
                      Import
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={getActiveGroupData().publishRows.length === 0}
                      className="h-10 px-5  text-[#4361EE] disabled:opacity-50 cursor-pointer ml-2"
                    >
                      <FolderUp className="w-4 h-4 mr-2" />
                      Export
                    </Button>
                  </div>
                </>
              )}
          </div>

          {/* Live Data Banners */}
          {showLiveBanner && activeView === "read" && (
            <div className="mb-4 flex items-center gap-2 text-xs bg-[#E0F7FA] border border-[#0DCAF0] text-[#0DCAF0] px-4 py-2.5 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                Showing live data from {prefix}/Readconfig/G{activeGroup + 1}
                /res — Group {activeGroup + 1} — not saved to database
              </span>
            </div>
          )}

          {showWifiLiveBanner && activeView === "wifi" && (
            <div className="mb-4 flex items-center gap-2 text-xs bg-[#E8F5E9] border border-[#2E7D32] text-[#2E7D32] px-4 py-2.5 rounded-lg animate-fadeIn">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#2E7D32]" />
              <span>WiFi response received from {prefix}/Wifi/res</span>
            </div>
          )}

          {showLocationLiveBanner && activeView === "location" && (
            <div className="mb-4 flex items-center gap-2 text-xs bg-[#E8F5E9] border border-[#2E7D32] text-[#2E7D32] px-4 py-2.5 rounded-lg animate-fadeIn">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#2E7D32]" />
              <span>
                Location response received from {prefix}/ReadLocationdetails/res
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
                      {TABLE_COLUMNS.map(col => (
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
                          <span className="font-medium text-[#4361EE]">
                            Add Row
                          </span>{" "}
                          to manually create.
                        </td>
                      </tr>
                    )}
                    {getActiveGroupData().publishRows.map((row, index) => {
                      const rows = getActiveGroupData().publishRows;
                      // Check if this row has validation errors
                      const rowErrors = validationErrors.filter(
                        err => err.row === index + 1
                      );
                      const hasError = rowErrors.length > 0;

                      return (
                        <tr
                          key={index}
                          className={`hover:bg-[#F8F9FA] transition-colors ${hasError ? "bg-red-50" : ""}`}
                        >
                          {TABLE_COLUMNS.map(col => {
                            const cellValue = row[col.key] ?? "";
                            // Check if this specific field has an error
                            const fieldError = rowErrors.find(
                              err => err.field === col.key
                            );

                            // Handle serial number column (read-only, auto-increment)
                            if (col.isSerial) {
                              return (
                                <td
                                  key={col.key}
                                  className={`${col.width} px-2 py-2 text-center`}
                                >
                                  <span className="text-sm text-[#212529] font-medium">
                                    {index + 1}
                                  </span>
                                </td>
                              );
                            }

                            if (col.key === "dataType") {
                              return (
                                <td
                                  key={col.key}
                                  className={`${col.width} px-2 py-2 text-center`}
                                >
                                  <select
                                    value={cellValue}
                                    onChange={e =>
                                      updateCell(index, col.key, e.target.value)
                                    }
                                    className={`w-full bg-white border ${fieldError ? "border-red-500 ring-1 ring-red-500" : "border-[#E9ECEF]"} focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] rounded-lg text-center [text-align-last:center] cursor-pointer`}
                                  >
                                    <option value="Int">Int</option>
                                    <option value="Float">Float</option>
                                  </select>
                                  {fieldError && (
                                    <div className="text-xs text-red-500 mt-0.5">
                                      {fieldError.message}
                                    </div>
                                  )}
                                </td>
                              );
                            }

                            if (col.key === "serialFormat") {
                              return (
                                <td
                                  key={col.key}
                                  className={`${col.width} px-2 py-2 text-center`}
                                >
                                  <select
                                    value={cellValue}
                                    onChange={e =>
                                      updateCell(index, col.key, e.target.value)
                                    }
                                    className={`w-full bg-white border ${fieldError ? "border-red-500 ring-1 ring-red-500" : "border-[#E9ECEF]"} focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] font-mono text-center [text-align-last:center] rounded-lg cursor-pointer`}
                                  >
                                    {SERIAL_FORMAT_OPTIONS.map(option => (
                                      <option
                                        key={option.value}
                                        value={option.value}
                                        title={option.label}
                                      >
                                        {option.value}
                                      </option>
                                    ))}
                                  </select>
                                  {fieldError && (
                                    <div className="text-xs text-red-500 mt-0.5">
                                      {fieldError.message}
                                    </div>
                                  )}
                                </td>
                              );
                            }

                            if (col.key === "functionCode") {
                              return (
                                <td
                                  key={col.key}
                                  className={`${col.width} px-2 py-2 text-center`}
                                >
                                  <select
                                    value={cellValue}
                                    onChange={e =>
                                      updateCell(index, col.key, e.target.value)
                                    }
                                    className={`w-full bg-white border ${fieldError ? "border-red-500 ring-1 ring-red-500" : "border-[#E9ECEF]"} focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] font-mono text-center [text-align-last:center] rounded-lg cursor-pointer`}
                                  >
                                    <option value="3">FC03(Holding)</option>
                                    <option value="4">FC04(Input Reg)</option>
                                  </select>
                                  {fieldError && (
                                    <div className="text-xs text-red-500 mt-0.5">
                                      {fieldError.message}
                                    </div>
                                  )}
                                </td>
                              );
                            }

                            if (col.key === "decimal") {
                              return (
                                <td
                                  key={col.key}
                                  className={`${col.width} px-2 py-2 text-center`}
                                >
                                  <select
                                    value={cellValue}
                                    onChange={e =>
                                      updateCell(
                                        index,
                                        col.key,
                                        parseInt(e.target.value) || 0
                                      )
                                    }
                                    className={`w-full bg-white border ${fieldError ? "border-red-500 ring-1 ring-red-500" : "border-[#E9ECEF]"} focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] rounded-lg text-center [text-align-last:center] cursor-pointer`}
                                  >
                                    <option value="0">0 (None)</option>
                                    <option value="1">1</option>
                                    <option value="2">2</option>
                                    <option value="3">3</option>
                                    <option value="4">4</option>
                                  </select>
                                  {fieldError && (
                                    <div className="text-xs text-red-500 mt-0.5">
                                      {fieldError.message}
                                    </div>
                                  )}
                                </td>
                              );
                            }
                            if (col.key === "baudRate") {
                              return (
                                <td
                                  key={col.key}
                                  className={`${col.width} px-2 py-2 text-center`}
                                >
                                  <select
                                    value={cellValue}
                                    onChange={e =>
                                      updateCell(
                                        index,
                                        col.key,
                                        parseInt(e.target.value) || 115200
                                      )
                                    }
                                    className={`w-full bg-white border ${fieldError ? "border-red-500 ring-1 ring-red-500" : "border-[#E9ECEF]"} focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] rounded-lg text-center [text-align-last:center] cursor-pointer`}
                                  >
                                    {BAUD_RATE_OPTIONS.map(option => (
                                      <option
                                        key={option.value}
                                        value={option.value}
                                      >
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                  {fieldError && (
                                    <div className="text-xs text-red-500 mt-0.5">
                                      {fieldError.message}
                                    </div>
                                  )}
                                </td>
                              );
                            }

                            if (col.key === "deviceName") {
                              const rowSpan = deviceNameSpans.get(index);
                              if (rowSpan && rowSpan > 1) {
                                // This is the start of a group - render with rowSpan
                                // Calculate parameter range for this device
                                let paramStart = index + 1;
                                let paramEnd = index + rowSpan;
                                const paramCount = rowSpan;

                                return (
                                  <td
                                    key={col.key}
                                    rowSpan={rowSpan}
                                    className={`${col.width} px-2 py-2 text-center align-top ${fieldError ? "border-l-2 border-red-500" : ""}`}
                                  >
                                    <div className="flex items-center gap-1">
                                      <input
                                        list={`device-list-${index}`}
                                        type="text"
                                        value={cellValue}
                                        placeholder="Type or select device"
                                        onChange={e => {
                                          const val = e.target.value;
                                          const duplicate =
                                            checkDuplicateDeviceName(
                                              val,
                                              index
                                            );

                                          if (duplicate) {
                                            // Show merge dialog
                                            setMergeData({
                                              currentIndex: index,
                                              currentDevice:
                                                rows[index]?.deviceName || "",
                                              existingDevice:
                                                duplicate.existingDevice,
                                              newDeviceName: val.trim(),
                                              rows: duplicate.existingRows,
                                            });
                                            setShowMergeDialog(true);
                                          } else {
                                            // Just update normally
                                            updateCell(index, col.key, val);
                                          }
                                        }}
                                        className={`flex-1 bg-white border ${fieldError ? "border-red-500 ring-1 ring-red-500" : "border-[#E9ECEF]"} focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] rounded-lg text-center`}
                                      />
                                    </div>
                                    <div className="mt-1 text-xs text-[#6C757D] font-medium">
                                      <span className="text-[#6C757D] ml-0.5">
                                        ({paramCount})
                                      </span>
                                    </div>
                                    {fieldError && (
                                      <div className="text-xs text-red-500 mt-0.5">
                                        {fieldError.message}
                                      </div>
                                    )}
                                    <datalist id={`device-list-${index}`}>
                                      {deviceOptions.map((opt, i) => (
                                        <option key={i} value={opt} />
                                      ))}
                                    </datalist>
                                  </td>
                                );
                              } else if (rowSpan === 1) {
                                // Single row - render normally
                                return (
                                  <td
                                    key={col.key}
                                    className={`${col.width} px-2 py-2 text-center ${fieldError ? "border-l-2 border-red-500" : ""}`}
                                  >
                                    <div className="flex items-center gap-1">
                                      <input
                                        list={`device-list-${index}`}
                                        type="text"
                                        value={cellValue}
                                        placeholder="Type or select device"
                                        onChange={e => {
                                          const val = e.target.value;
                                          const duplicate =
                                            checkDuplicateDeviceName(
                                              val,
                                              index
                                            );

                                          if (duplicate) {
                                            // Show merge dialog
                                            setMergeData({
                                              currentIndex: index,
                                              currentDevice:
                                                rows[index]?.deviceName || "",
                                              existingDevice:
                                                duplicate.existingDevice,
                                              newDeviceName: val.trim(),
                                              rows: duplicate.existingRows,
                                            });
                                            setShowMergeDialog(true);
                                          } else {
                                            // Just update normally
                                            updateCell(index, col.key, val);
                                          }
                                        }}
                                        className={`flex-1 bg-white border ${fieldError ? "border-red-500 ring-1 ring-red-500" : "border-[#E9ECEF]"} focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] rounded-lg text-center`}
                                      />
                                    </div>
                                    <div className="mt-1 text-xs text-[#6C757D] font-medium">
                                      P{index + 1}
                                      <span className="text-[#6C757D] ml-0.5">
                                        (1)
                                      </span>
                                    </div>
                                    {fieldError && (
                                      <div className="text-xs text-red-500 mt-0.5">
                                        {fieldError.message}
                                      </div>
                                    )}
                                    <datalist id={`device-list-${index}`}>
                                      {deviceOptions.map((opt, i) => (
                                        <option key={i} value={opt} />
                                      ))}
                                    </datalist>
                                  </td>
                                );
                              } else {
                                // Part of a merged group - skip rendering
                                return null;
                              }
                            }

                            if (col.key === "slaveId") {
                              const rowSpan = slaveIdSpans.get(index);
                              if (rowSpan && rowSpan > 1) {
                                // This is the start of a group - render with rowSpan
                                return (
                                  <td
                                    key={col.key}
                                    rowSpan={rowSpan}
                                    className={`${col.width} px-2 py-2 text-center align-top ${fieldError ? "border-l-2 border-red-500" : ""}`}
                                  >
                                    <select
                                      value={cellValue}
                                      onChange={e => {
                                        updateCell(
                                          index,
                                          col.key,
                                          e.target.value
                                        );
                                      }}
                                      className={`w-full bg-white border ${fieldError ? "border-red-500 ring-1 ring-red-500" : "border-[#E9ECEF]"} focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] rounded-lg text-center [text-align-last:center] cursor-pointer`}
                                    >
                                      {Array.from(
                                        { length: 31 },
                                        (_, i) => i + 1
                                      ).map(id => (
                                        <option key={id} value={id}>
                                          {id}
                                        </option>
                                      ))}
                                    </select>
                                    {fieldError && (
                                      <div className="text-xs text-red-500 mt-0.5">
                                        {fieldError.message}
                                      </div>
                                    )}
                                  </td>
                                );
                              } else if (rowSpan === 1) {
                                // Single row - render normally
                                return (
                                  <td
                                    key={col.key}
                                    className={`${col.width} px-2 py-2 text-center ${fieldError ? "border-l-2 border-red-500" : ""}`}
                                  >
                                    <select
                                      value={cellValue}
                                      onChange={e => {
                                        updateCell(
                                          index,
                                          col.key,
                                          e.target.value
                                        );
                                      }}
                                      className={`w-full bg-white border ${fieldError ? "border-red-500 ring-1 ring-red-500" : "border-[#E9ECEF]"} focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] rounded-lg text-center [text-align-last:center] cursor-pointer`}
                                    >
                                      {Array.from(
                                        { length: 31 },
                                        (_, i) => i + 1
                                      ).map(id => (
                                        <option key={id} value={id}>
                                          {id}
                                        </option>
                                      ))}
                                    </select>
                                    {fieldError && (
                                      <div className="text-xs text-red-500 mt-0.5">
                                        {fieldError.message}
                                      </div>
                                    )}
                                  </td>
                                );
                              } else {
                                // Part of a merged group - skip rendering
                                return null;
                              }
                            }

                            if (col.key === "parameterName") {
                              return (
                                <td
                                  key={col.key}
                                  className={`${col.width} px-2 py-2 text-center ${fieldError ? "border-l-2 border-red-500" : ""}`}
                                >
                                  <div className="flex items-center justify-center gap-1">
                                    <input
                                      type="text"
                                      value={cellValue}
                                      disabled
                                      className={`flex-1 bg-[#F8F9FA] border ${fieldError ? "border-red-500 ring-1 ring-red-500" : "border-[#E9ECEF]"} px-2 py-1 text-sm text-[#6C757D] rounded-lg text-center cursor-not-allowed`}
                                    />
                                    <button
                                      onClick={() => addRowWithDevice(index)}
                                      disabled={
                                        rows.length >= PARAMETERS_PER_GROUP
                                      }
                                      className="p-1 text-[#4361EE] hover:text-[#3A53D0] hover:bg-[#EEF0FE] rounded-lg transition-colors inline-flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                      title="Add parameter to this device"
                                    >
                                      <Plus className="w-4 h-4" />
                                    </button>
                                  </div>
                                  {fieldError && (
                                    <div className="text-xs text-red-500 mt-0.5">
                                      {fieldError.message}
                                    </div>
                                  )}
                                </td>
                              );
                            }

                            return (
                              <td
                                key={col.key}
                                className={`${col.width} px-2 py-2 text-center ${fieldError ? "border-l-2 border-red-500" : ""}`}
                              >
                                <input
                                  type="text"
                                  value={cellValue}
                                  onChange={e => {
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
                                  className={`w-full bg-white border ${fieldError ? "border-red-500 ring-1 ring-red-500" : "border-[#E9ECEF]"} focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] rounded-lg text-center`}
                                />
                                {fieldError && (
                                  <div className="text-xs text-red-500 mt-0.5">
                                    {fieldError.message}
                                  </div>
                                )}
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
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Add Row Button */}
              <div className="px-4 py-3 border-t border-[#E9ECEF]">
                <button
                  onClick={addRow}
                  disabled={
                    getActiveGroupData().publishRows.length >=
                    PARAMETERS_PER_GROUP
                  }
                  className="inline-flex items-center gap-1.5 text-sm text-[#4361EE] hover:text-[#3A53D0] font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  Add Device
                </button>
                <span className="ml-4 text-xs text-[#6C757D]">
                  {getActiveGroupData().publishRows.length} /{" "}
                  {PARAMETERS_PER_GROUP}
                </span>
                <span className="ml-4 text-xs text-[#4361EE] font-medium flex items-center gap-1">
                  <NotebookPen className="w-3 h-3" />
                  Total: {getActiveGroupData().publishRows.length} parameter
                  {getActiveGroupData().publishRows.length !== 1 ? "s" : ""}
                </span>
                <div className="flex justify-end">
                  <Button
                    onClick={handlePublish}
                    disabled={
                      publishing ||
                      getActiveGroupData().publishRows.length === 0 ||
                      !prefix
                    }
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
                      {TABLE_COLUMNS.map(col => (
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
                          <span className="font-medium text-[#4361EE]">
                            Read Config
                          </span>{" "}
                          to fetch from device.
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
                    {getActiveGroupData().readRows.map((row, index) => {
                      const rows = getActiveGroupData().readRows;
                      return (
                        <tr
                          key={index}
                          className="hover:bg-[#F8F9FA] transition-colors"
                        >
                          {TABLE_COLUMNS.map(col => {
                            const cellValue = row[col.key] ?? "";

                            // Handle serial number column (read-only, auto-increment)
                            if (col.isSerial) {
                              return (
                                <td
                                  key={col.key}
                                  className={`${col.width} px-2 py-2 text-center`}
                                >
                                  <span className="text-sm text-[#212529] font-medium">
                                    {index + 1}
                                  </span>
                                </td>
                              );
                            }

                            if (col.key === "dataType") {
                              return (
                                <td
                                  key={col.key}
                                  className={`${col.width} px-2 py-2 text-center`}
                                >
                                  <select
                                    value={cellValue}
                                    onChange={e =>
                                      updateCell(index, col.key, e.target.value)
                                    }
                                    className="w-full bg-white border border-[#E9ECEF] focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] rounded-lg text-center [text-align-last:center] cursor-pointer"
                                  >
                                    <option value="Int">Int</option>
                                    <option value="Float">Float</option>
                                  </select>
                                </td>
                              );
                            }

                            if (col.key === "serialFormat") {
                              return (
                                <td
                                  key={col.key}
                                  className={`${col.width} px-2 py-2 text-center`}
                                >
                                  <select
                                    value={cellValue}
                                    onChange={e =>
                                      updateCell(index, col.key, e.target.value)
                                    }
                                    className="w-full bg-white border border-[#E9ECEF] focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] font-mono text-center [text-align-last:center] rounded-lg cursor-pointer"
                                  >
                                    {SERIAL_FORMAT_OPTIONS.map(option => (
                                      <option
                                        key={option.value}
                                        value={option.value}
                                        title={option.label}
                                      >
                                        {option.value}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              );
                            }

                            if (col.key === "functionCode") {
                              return (
                                <td
                                  key={col.key}
                                  className={`${col.width} px-2 py-2 text-center`}
                                >
                                  <select
                                    value={cellValue}
                                    onChange={e =>
                                      updateCell(index, col.key, e.target.value)
                                    }
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

                            if (col.key === "decimal") {
                              return (
                                <td
                                  key={col.key}
                                  className={`${col.width} px-2 py-2 text-center`}
                                >
                                  <select
                                    value={cellValue}
                                    onChange={e =>
                                      updateCell(
                                        index,
                                        col.key,
                                        parseInt(e.target.value) || 0
                                      )
                                    }
                                    className="w-full bg-white border border-[#E9ECEF] focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] rounded-lg text-center [text-align-last:center] cursor-pointer"
                                  >
                                    <option value="0">0 (None)</option>
                                    <option value="1">1</option>
                                    <option value="2">2</option>
                                  </select>
                                </td>
                              );
                            }

                            if (col.key === "deviceName") {
                              const rowSpan = deviceNameSpans.get(index);
                              if (rowSpan && rowSpan > 1) {
                                // This is the start of a group - render with rowSpan
                                // Calculate parameter range for this device
                                let paramStart = index + 1;
                                let paramEnd = index + rowSpan;
                                const paramCount = rowSpan;

                                return (
                                  <td
                                    key={col.key}
                                    rowSpan={rowSpan}
                                    className={`${col.width} px-2 py-2 text-center align-top`}
                                  >
                                    <div className="flex items-center gap-1">
                                      <input
                                        list={`device-list-${index}`}
                                        type="text"
                                        value={cellValue}
                                        placeholder="Type or select device"
                                        onChange={e => {
                                          const val = e.target.value;
                                          const duplicate =
                                            checkDuplicateDeviceName(
                                              val,
                                              index
                                            );

                                          if (duplicate) {
                                            // Show merge dialog
                                            setMergeData({
                                              currentIndex: index,
                                              currentDevice:
                                                rows[index]?.deviceName || "",
                                              existingDevice:
                                                duplicate.existingDevice,
                                              newDeviceName: val.trim(),
                                              rows: duplicate.existingRows,
                                            });
                                            setShowMergeDialog(true);
                                          } else {
                                            // Just update normally
                                            updateCell(index, col.key, val);
                                          }
                                        }}
                                        className="flex-1 bg-white border border-[#E9ECEF] focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] rounded-lg text-center"
                                      />
                                    </div>
                                    <div className="mt-1 text-xs text-[#6C757D] font-medium">
                                      P{paramStart}–P{paramEnd}
                                      <span className="text-[#6C757D] ml-0.5">
                                        ({paramCount})
                                      </span>
                                    </div>
                                    <datalist id={`device-list-${index}`}>
                                      {deviceOptions.map((opt, i) => (
                                        <option key={i} value={opt} />
                                      ))}
                                    </datalist>
                                  </td>
                                );
                              } else if (rowSpan === 1) {
                                // Single row - render normally
                                return (
                                  <td
                                    key={col.key}
                                    className={`${col.width} px-2 py-2 text-center`}
                                  >
                                    <div className="flex items-center gap-1">
                                      <input
                                        list={`device-list-${index}`}
                                        type="text"
                                        value={cellValue}
                                        placeholder="Type or select device"
                                        onChange={e => {
                                          const val = e.target.value;
                                          const duplicate =
                                            checkDuplicateDeviceName(
                                              val,
                                              index
                                            );

                                          if (duplicate) {
                                            // Show merge dialog
                                            setMergeData({
                                              currentIndex: index,
                                              currentDevice:
                                                rows[index]?.deviceName || "",
                                              existingDevice:
                                                duplicate.existingDevice,
                                              newDeviceName: val.trim(),
                                              rows: duplicate.existingRows,
                                            });
                                            setShowMergeDialog(true);
                                          } else {
                                            // Just update normally
                                            updateCell(index, col.key, val);
                                          }
                                        }}
                                        className="flex-1 bg-white border border-[#E9ECEF] focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] rounded-lg text-center"
                                      />
                                    </div>
                                    <div className="mt-1 text-xs text-[#6C757D] font-medium">
                                      P{index + 1}
                                      <span className="text-[#6C757D] ml-0.5">
                                        (1)
                                      </span>
                                    </div>
                                    <datalist id={`device-list-${index}`}>
                                      {deviceOptions.map((opt, i) => (
                                        <option key={i} value={opt} />
                                      ))}
                                    </datalist>
                                  </td>
                                );
                              } else {
                                // Part of a merged group - skip rendering
                                return null;
                              }
                            }

                            if (col.key === "slaveId") {
                              const rowSpan = slaveIdSpans.get(index);
                              if (rowSpan && rowSpan > 1) {
                                // This is the start of a group - render with rowSpan
                                return (
                                  <td
                                    key={col.key}
                                    rowSpan={rowSpan}
                                    className={`${col.width} px-2 py-2 text-center align-middle`}
                                  >
                                    <select
                                      value={cellValue}
                                      onChange={e => {
                                        updateCell(
                                          index,
                                          col.key,
                                          e.target.value
                                        );
                                      }}
                                      className="w-full bg-white border border-[#E9ECEF] focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] rounded-lg text-center [text-align-last:center] cursor-pointer"
                                    >
                                      {Array.from(
                                        { length: 31 },
                                        (_, i) => i + 1
                                      ).map(id => (
                                        <option key={id} value={id}>
                                          {id}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                );
                              } else if (rowSpan === 1) {
                                // Single row - render normally
                                return (
                                  <td
                                    key={col.key}
                                    className={`${col.width} px-2 py-2 text-center`}
                                  >
                                    <select
                                      value={cellValue}
                                      onChange={e => {
                                        updateCell(
                                          index,
                                          col.key,
                                          e.target.value
                                        );
                                      }}
                                      className="w-full bg-white border border-[#E9ECEF] focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-2 py-1 text-sm text-[#212529] rounded-lg text-center [text-align-last:center] cursor-pointer"
                                    >
                                      {Array.from(
                                        { length: 31 },
                                        (_, i) => i + 1
                                      ).map(id => (
                                        <option key={id} value={id}>
                                          {id}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                );
                              } else {
                                // Part of a merged group - skip rendering
                                return null;
                              }
                            }

                            if (col.key === "parameterName") {
                              return (
                                <td
                                  key={col.key}
                                  className={`${col.width} px-2 py-2 text-center`}
                                >
                                  <div className="flex items-center justify-center gap-1">
                                    <input
                                      type="text"
                                      value={cellValue}
                                      disabled
                                      className="flex-1 bg-[#F8F9FA] border border-[#E9ECEF] px-2 py-1 text-sm text-[#6C757D] rounded-lg text-center cursor-not-allowed"
                                    />
                                    <button
                                      onClick={() => addRowWithDevice(index)}
                                      disabled={
                                        rows.length >= PARAMETERS_PER_GROUP
                                      }
                                      className="p-1 text-[#4361EE] hover:text-[#3A53D0] hover:bg-[#EEF0FE] rounded-lg transition-colors inline-flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                      title="Add parameter to this device"
                                    >
                                      <Plus className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              );
                            }

                            return (
                              <td
                                key={col.key}
                                className={`${col.width} px-2 py-2 text-center`}
                              >
                                <input
                                  type="text"
                                  value={cellValue}
                                  onChange={e => {
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
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Add Row Button */}
              <div className="px-4 py-3 border-t border-[#E9ECEF]">
                <button
                  onClick={addRow}
                  disabled={
                    getActiveGroupData().readRows.length >= PARAMETERS_PER_GROUP
                  }
                  className="inline-flex items-center gap-1.5 text-sm text-[#4361EE] hover:text-[#3A53D0] font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  Add Row
                </button>
                {getActiveGroupData().readRows.length > 0 && (
                  <button
                    onClick={() =>
                      addRowToDevice(getActiveGroupData().readRows.length - 1)
                    }
                    disabled={
                      getActiveGroupData().readRows.length >=
                      PARAMETERS_PER_GROUP
                    }
                    className="ml-4 inline-flex items-center gap-1.5 text-sm text-[#4361EE] hover:text-[#3A53D0] font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                    Add Parameter to Last Device
                  </button>
                )}
                <span className="ml-4 text-xs text-[#6C757D]">
                  {getActiveGroupData().readRows.length} /{" "}
                  {PARAMETERS_PER_GROUP}
                </span>
                <span className="ml-4 text-xs text-[#4361EE] font-medium flex items-center gap-1">
                  <BookOpen className="w-3 h-3" />
                  Total: {getActiveGroupData().readRows.length} parameter
                  {getActiveGroupData().readRows.length !== 1 ? "s" : ""}
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
                  WiFi Configuration
                </h2>
                <Button
                  onClick={handleReadWifi}
                  disabled={!prefix || readingWifi}
                  variant="outline"
                  className="h-10 px-5 border-[#4361EE] text-[#4361EE] hover:bg-[#EEF0FE] disabled:opacity-50 cursor-pointer"
                >
                  {readingWifi ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Reading...
                    </>
                  ) : (
                    "Read WiFi"
                  )}
                </Button>
              </div>

              {/* WiFi Response Display */}
              {wifiResponse &&
                (() => {
                  const [ssid, password] = wifiResponse.split(",");

                  return (
                    <div className="bg-white border border-[#E9ECEF] rounded-xl p-4 shadow-sm">
                      <table className="w-full border border-[#E9ECEF]">
                        <thead>
                          <tr className="bg-[#F8F9FA]">
                            <th className="border border-[#E9ECEF] p-2 text-left">
                              SSID
                            </th>
                            <th className="border border-[#E9ECEF] p-2 text-left">
                              Password
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="border border-[#E9ECEF] p-2">
                              {ssid}
                            </td>
                            <td className="border border-[#E9ECEF] p-2">
                              {password}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })()}

              {readingWifi && !wifiResponse && (
                <div className="bg-white border border-[#E9ECEF] rounded-xl p-12 shadow-sm">
                  <div className="flex items-center justify-center gap-2 text-sm text-[#6C757D]">
                    <Loader2 className="w-4 h-4 animate-spin text-[#4361EE]" />
                    Waiting for WiFi response...
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Location Section */}
          {gateway.data && activeView === "location" && (
            <div className="mt-2 animate-fadeIn">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[#212529] tracking-tight">
                  Location Configuration
                </h2>
              </div>

              {/* Location Input Section */}
              <div className="bg-white border border-[#E9ECEF] rounded-xl p-4 mb-4 shadow-sm">
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-[#6C757D] mb-1.5">
                      Location Name
                    </label>
                    <input
                      type="text"
                      value={locationInput}
                      onChange={e => setLocationInput(e.target.value)}
                      placeholder="Enter location name"
                      className="w-40 bg-white border border-[#E9ECEF] focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-3 py-2 text-sm text-[#212529] rounded-lg"
                    />
                    <Button
                      onClick={handleSetLocation}
                      disabled={!prefix || !locationInput}
                      className="h-10 px-5 ml-2 bg-[#4361EE] hover:bg-[#3A53D0] text-white disabled:opacity-50 cursor-pointer"
                    >
                      Set Location
                    </Button>
                    <Button
                      onClick={handleReadLocation}
                      disabled={!prefix || readingLocation}
                      variant="outline"
                      className="h-10 px-5 border-[#4361EE] text-[#4361EE] hover:bg-[#EEF0FE] disabled:opacity-50 cursor-pointer"
                    >
                      {readingLocation ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Reading...
                        </>
                      ) : (
                        "Read Location"
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Location Response Display */}
              {locationResponse && (
                <div className="bg-white border border-[#E9ECEF] rounded-xl p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-[#212529] mb-2">
                    Location Response from {prefix}/ReadLocationdetails/res
                  </h3>
                  <pre className="bg-[#F8F9FA] border border-[#E9ECEF] rounded-lg p-3 text-sm text-[#212529] font-mono overflow-x-auto">
                    {locationResponse}
                  </pre>
                </div>
              )}

              {readingLocation && !locationResponse && (
                <div className="bg-white border border-[#E9ECEF] rounded-xl p-12 shadow-sm">
                  <div className="flex items-center justify-center gap-2 text-sm text-[#6C757D]">
                    <Loader2 className="w-4 h-4 animate-spin text-[#4361EE]" />
                    Waiting for location response...
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Delay Section */}
          {gateway.data && activeView === "delay" && (
            <div className="mt-2 animate-fadeIn">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[#212529] tracking-tight">
                  Delay Configuration
                </h2>
              </div>

              {/* Delay Input Section */}
              <div className="bg-white border border-[#E9ECEF] rounded-xl p-4 mb-4 shadow-sm">
                <div className="flex">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-[#6C757D] mb-1.5">
                      Delay Value
                    </label>
                    <input
                      type="text"
                      value={delayInput}
                      onChange={e => setDelayInput(e.target.value)}
                      placeholder="publish interval (seconds)"
                      className="w-40 bg-white border border-[#E9ECEF] focus:border-[#4361EE] focus:ring-1 focus:ring-[#EEF0FE] focus:outline-none px-3 py-2 text-sm text-[#212529] rounded-lg"
                    />
                    <Button
                      onClick={handleSetDelay}
                      disabled={!prefix || !delayInput}
                      className="h-10 ml-4 px-5 bg-[#4361EE] hover:bg-[#3A53D0] text-white disabled:opacity-50 cursor-pointer"
                    >
                      Set Interval
                    </Button>
                  </div>
                </div>
              </div>

              {/* Delay Response Display */}
              {delayResponse && (
                <div className="bg-white border border-[#E9ECEF] rounded-xl p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-[#212529] mb-2">
                    Delay Response from {prefix}/Delay
                  </h3>
                  <pre className="bg-[#F8F9FA] border border-[#E9ECEF] rounded-lg p-3 text-sm text-[#212529] font-mono overflow-x-auto">
                    {delayResponse}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Merge Confirmation Dialog */}
        {showMergeDialog && mergeData && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fadeIn">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 bg-amber-50 rounded-lg">
                  <AlertCircle className="w-6 h-6 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#212529]">
                    Merge Devices?
                  </h3>
                  <p className="text-sm text-[#6C757D] mt-1">
                    Device name <strong>"{mergeData.newDeviceName}"</strong>{" "}
                    already exists.
                  </p>
                </div>
              </div>

              <div className="bg-[#F8F9FA] rounded-lg p-4 mb-4">
                <div className="text-sm">
                  <div className="flex items-center justify-between py-1 border-b border-[#E9ECEF]">
                    <span className="text-[#6C757D]">Current Device</span>
                    <span className="font-medium text-[#212529]">
                      {mergeData.currentDevice || "(empty)"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-[#6C757D]">Existing Device</span>
                    <span className="font-medium text-[#212529]">
                      {mergeData.existingDevice}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-t border-[#E9ECEF] mt-1 pt-1">
                    <span className="text-[#6C757D]">
                      Parameters in existing device
                    </span>
                    <span className="font-medium text-[#212529]">
                      {mergeData.rows.length}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-sm text-[#6C757D] mb-4">
                Merging will combine all parameters under the same device name.
                {mergeData.rows.length > 0 &&
                  ` ${mergeData.rows.length} existing parameter(s) will be grouped together.`}
              </p>

              <div className="flex items-center gap-3">
                <Button
                  onClick={() => {
                    // Merge: Update device name and group all rows
                    mergeDevices(
                      mergeData.currentIndex,
                      mergeData.newDeviceName
                    );
                    setShowMergeDialog(false);
                    setMergeData(null);
                    toast.success(
                      `✅ Merged "${mergeData.newDeviceName}" devices`
                    );
                  }}
                  className="flex-1 h-10 bg-[#4361EE] hover:bg-[#3A53D0] text-white cursor-pointer"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Yes, Merge
                </Button>
                <Button
                  onClick={() => {
                    // Cancel: Revert to original value
                    setShowMergeDialog(false);
                    setMergeData(null);
                  }}
                  variant="ghost"
                  className="h-10 px-3 text-[#6C757D] hover:bg-[#F8F9FA] cursor-pointer"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
