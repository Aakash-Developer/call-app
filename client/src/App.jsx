import { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import { Device } from "@twilio/voice-sdk";

function App() {
  const [device, setDevice] = useState(null);
  const [deviceReady, setDeviceReady] = useState(false);
  const [deviceError, setDeviceError] = useState(null);
  const [number, setNumber] = useState("");
  const [activeCall, setActiveCall] = useState(null);
  const [callStatus, setCallStatus] = useState(""); // "ringing", "connected", "disconnected"
  const [incomingCall, setIncomingCall] = useState(null);
  const [incomingCallerId, setIncomingCallerId] = useState("");
  const callHandledRef = useRef(false);

  const handleCall = useCallback((call) => {
    if (!call) {
      console.error("handleCall received undefined call object");
      return;
    }

    // Prevent handling the same call twice
    if (callHandledRef.current) {
      console.log("Call already handled, skipping...");
      return;
    }

    console.log("Call object:", call);
    console.log("Call object type:", typeof call);
    console.log("Call object methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(call)));
    console.log("Call object keys:", Object.keys(call));
    console.log("Has disconnect?", typeof call.disconnect === 'function');
    console.log("Has hangup?", typeof call.hangup === 'function');
    console.log("Has reject?", typeof call.reject === 'function');

    // Store disconnect method info for later use
    const disconnectMethod = typeof call.disconnect === 'function' ? 'disconnect' :
      typeof call.hangup === 'function' ? 'hangup' :
        typeof call.reject === 'function' ? 'reject' : null;
    console.log("Available disconnect method:", disconnectMethod);

    callHandledRef.current = true;
    setActiveCall(call);
    // Set status based on call state
    if (call.status === "open" || call.status === "connected") {
      setCallStatus("connected");
    } else {
      setCallStatus("ringing");
    }

    // Check if call has 'on' method, if not, try alternative event handling
    if (typeof call.on === 'function') {
      call.on("accept", () => {
        console.log("Call accepted");
        setCallStatus("connected");
      });

      call.on("disconnect", () => {
        console.log("Call disconnected event fired");
        callHandledRef.current = false;
        // Use setTimeout to ensure React state updates properly
        setTimeout(() => {
          setActiveCall(null);
          setCallStatus("");
        }, 0);
      });

      call.on("cancel", () => {
        console.log("Call cancelled event fired");
        callHandledRef.current = false;
        setTimeout(() => {
          setActiveCall(null);
          setCallStatus("");
        }, 0);
      });

      call.on("reject", () => {
        console.log("Call rejected event fired");
        callHandledRef.current = false;
        setTimeout(() => {
          setActiveCall(null);
          setCallStatus("");
        }, 0);
      });

      call.on("error", (error) => {
        console.error("Call error:", error);
        callHandledRef.current = false;
        setTimeout(() => {
          setActiveCall(null);
          setCallStatus("");
        }, 0);
        alert("Call error: " + error.message);
      });

      // Monitor call status property if available (fallback mechanism)
      if (call.status !== undefined) {
        console.log("Initial call status:", call.status);
        // Check status periodically as a fallback
        const statusCheckInterval = setInterval(() => {
          try {
            // Check if call object still exists and has status
            if (call && typeof call.status !== 'undefined') {
              const currentStatus = call.status;
              console.log("Call status check:", currentStatus);

              // Check for ended call statuses
              if (currentStatus === "closed" ||
                currentStatus === "completed" ||
                currentStatus === "failed" ||
                currentStatus === "canceled" ||
                currentStatus === "disconnected") {
                console.log("Call ended based on status:", currentStatus);
                clearInterval(statusCheckInterval);
                callHandledRef.current = false;
                setTimeout(() => {
                  setActiveCall(null);
                  setCallStatus("");
                }, 0);
              }
            } else {
              // Call object no longer exists, clean up
              clearInterval(statusCheckInterval);
            }
          } catch (error) {
            console.error("Error checking call status:", error);
            clearInterval(statusCheckInterval);
          }
        }, 1000);

        // Clean up interval when call disconnects
        const cleanupInterval = () => {
          clearInterval(statusCheckInterval);
        };
        call.on("disconnect", cleanupInterval);
        call.on("cancel", cleanupInterval);
        call.on("error", cleanupInterval);
      }
    } else {
      // Fallback: use device-level events or check call properties
      console.warn("Call object does not have 'on' method. Available methods:", Object.keys(call));

      // Try using addEventListener if available
      if (typeof call.addEventListener === 'function') {
        call.addEventListener("accept", () => {
          setCallStatus("connected");
        });
        call.addEventListener("disconnect", () => {
          callHandledRef.current = false;
          setTimeout(() => {
            setActiveCall(null);
            setCallStatus("");
          }, 0);
        });
      } else {
        // If no event methods, at least track the call object
        console.warn("No event listener methods found on call object. Call tracking may be limited.");
      }
    }
  }, []);

  useEffect(() => {
    let dev = null;

    const initializeDevice = async () => {
      try {
        setDeviceError(null);
        // Request token with identity for support (can be changed to "user-sales" for sales)
        const res = await axios.get("https://unfaintly-hideless-zuri.ngrok-free.dev/token?identity=user-support", {
          headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true'
          }
        });

        dev = new Device(res.data.token);
        setDevice(dev);

        // Wait for device to be ready
        dev.on("registered", () => {
          setDeviceReady(true);
        });

        dev.on("error", (error) => {
          console.error("Device error:", error);
          setDeviceError(error.message);
          setDeviceReady(false);
        });

        dev.on("incoming", (call) => {
          console.log("=".repeat(50));
          console.log("📞 INCOMING CALL RECEIVED");
          console.log("=".repeat(50));
          console.log("Call object:", call);
          console.log("Call parameters:", call.parameters);
          console.log("Call from:", call.from);

          // Get caller ID if available
          const callerId = call.parameters?.From || call.from || call.parameters?.Caller || "Unknown";
          console.log("Caller ID:", callerId);

          setIncomingCallerId(callerId);
          setIncomingCall(call);
          setCallStatus("incoming");

          // Set up call event listeners before accepting
          call.on("accept", () => {
            console.log("✅ Call accepted event fired");
            setCallStatus("connected");
          });

          call.on("disconnect", () => {
            console.log("📴 Call disconnected event fired");
            callHandledRef.current = false;
            setTimeout(() => {
              setActiveCall(null);
              setCallStatus("");
            }, 0);
          });

          call.on("error", (error) => {
            console.error("❌ Call error:", error);
            callHandledRef.current = false;
            setTimeout(() => {
              setActiveCall(null);
              setCallStatus("");
            }, 0);
            alert("Call error: " + error.message);
          });

          // Auto-reject after 30 seconds if not answered
          const timeout = setTimeout(() => {
            console.log("⏱️ Incoming call timeout (30s), rejecting...");
            try {
              call.reject();
            } catch (error) {
              console.error("Error rejecting call:", error);
            }
            setIncomingCall(null);
            setIncomingCallerId("");
            setCallStatus("");
          }, 30000);

          // Store timeout in call object for cleanup
          call._timeout = timeout;
          console.log("=".repeat(50));
        });

        // Listen for outgoing call events on the device
        // Note: This is a fallback - device.connect() should return the call object directly
        dev.on("connect", (call) => {
          // Only handle if not already handled from device.connect() return value
          if (!callHandledRef.current) {
            handleCall(call);
          }
        });

        // Listen for device-level disconnect events (fallback if call-level events don't fire)
        dev.on("disconnect", (call) => {
          console.log("Device disconnect event fired");
          callHandledRef.current = false;
          setTimeout(() => {
            setActiveCall(null);
            setCallStatus("");
          }, 0);
        });

        // Register the device
        dev.register();
      } catch (error) {
        console.error("Failed to initialize device:", error);
        setDeviceError(error.message || "Failed to initialize device");
        setDeviceReady(false);
      }
    };

    initializeDevice();

    // Cleanup on unmount
    return () => {
      if (dev) {
        dev.destroy();
      }
      callHandledRef.current = false;
    };
  }, [handleCall]);

  // Monitor activeCall and clear if call object becomes invalid
  useEffect(() => {
    if (!activeCall) return;

    const currentCall = activeCall;
    // Check if call object is still valid
    const checkCall = setInterval(() => {
      try {
        // Check if we still have the same call reference
        if (activeCall === currentCall && currentCall) {
          const status = currentCall.status;
          if (status === "closed" ||
            status === "completed" ||
            status === "failed" ||
            status === "canceled" ||
            status === "disconnected" ||
            status === "ended") {
            console.log("Call ended detected via status check:", status);
            clearInterval(checkCall);
            callHandledRef.current = false;
            setTimeout(() => {
              setActiveCall(null);
              setCallStatus("");
            }, 0);
          }
        } else if (activeCall !== currentCall) {
          // Call reference changed, clean up
          clearInterval(checkCall);
        }
      } catch (error) {
        // Call object is invalid, clear state
        console.log("Call object invalid, clearing state:", error);
        clearInterval(checkCall);
        callHandledRef.current = false;
        setTimeout(() => {
          setActiveCall(null);
          setCallStatus("");
        }, 0);
      }
    }, 500); // Check every 500ms

    return () => clearInterval(checkCall);
  }, [activeCall]);

  // Clear callStatus if activeCall is null
  useEffect(() => {
    if (!activeCall && callStatus && callStatus !== "incoming") {
      setCallStatus("");
    }
  }, [activeCall, callStatus]);

  // Accept incoming call
  const acceptIncomingCall = () => {
    if (!incomingCall) {
      console.warn("⚠️ No incoming call to accept");
      return;
    }

    if (!device || !deviceReady) {
      console.error("❌ Device not ready, cannot accept call");
      alert("Device is not ready. Please wait for device initialization.");
      return;
    }

    console.log("=".repeat(50));
    console.log("✅ ACCEPTING INCOMING CALL");
    console.log("=".repeat(50));
    console.log("Call object:", incomingCall);
    console.log("Call status:", incomingCall.status);
    console.log("Device ready:", deviceReady);

    // Clear timeout if exists
    if (incomingCall._timeout) {
      clearTimeout(incomingCall._timeout);
      console.log("⏱️ Cleared auto-reject timeout");
    }

    try {
      // Accept the call first
      console.log("📞 Calling accept() on call object...");
      incomingCall.accept();
      console.log("✅ Call accept() called successfully");

      // Small delay to ensure accept() completes before handling
      setTimeout(() => {
        // Then handle the call (set up event listeners)
        console.log("📋 Setting up call handlers...");
        handleCall(incomingCall);

        // Clear incoming call state
        setIncomingCall(null);
        setIncomingCallerId("");
        console.log("✅ Incoming call accepted and handled");
        console.log("=".repeat(50));
      }, 100);
    } catch (error) {
      console.error("❌ Error accepting call:", error);
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      alert("Failed to accept call: " + error.message);
      // Clean up on error
      setIncomingCall(null);
      setIncomingCallerId("");
      setCallStatus("");
    }
  };

  // Reject incoming call
  const rejectIncomingCall = () => {
    if (incomingCall) {
      console.log("Rejecting incoming call");
      // Clear timeout if exists
      if (incomingCall._timeout) {
        clearTimeout(incomingCall._timeout);
      }
      try {
        incomingCall.reject();
      } catch (error) {
        console.error("Error rejecting call:", error);
      }
      setIncomingCall(null);
      setIncomingCallerId("");
      setCallStatus("");
    }
  };

  const makeCall = async () => {
    if (!device || !deviceReady) {
      return alert("Device not ready. Please wait for device initialization.");
    }

    if (activeCall) {
      return alert("A call is already active. Please disconnect the current call first.");
    }

    if (!number.trim()) {
      return alert("Please enter a number to call.");
    }

    try {
      // First, notify backend about the call
      console.log("📞 Making call to:", number);
      try {
        const backendResponse = await axios.post(
          "https://unfaintly-hideless-zuri.ngrok-free.dev/call",
          { to: number },
          {
            headers: {
              'Content-Type': 'application/json',
              'ngrok-skip-browser-warning': 'true'
            }
          }
        );
        console.log("✅ Backend call initiated:", backendResponse.data);
      } catch (backendError) {
        console.warn("⚠️ Backend call logging failed (continuing with WebRTC call):", backendError.message);
        // Continue with WebRTC call even if backend call fails
      }

      // Then, make the WebRTC call using device.connect()
      const call = device.connect({
        params: { To: number },
      });

      // Check if we got a valid call object
      if (call && typeof call === 'object') {
        // The call object should be available immediately
        callHandledRef.current = false; // Reset flag before handling new call
        handleCall(call);
      } else {
        // If no call object returned, wait for device 'connect' event
        callHandledRef.current = false; // Reset flag
        setCallStatus("ringing");
        console.log("Waiting for device 'connect' event...");
      }
    } catch (error) {
      console.error("Failed to make call:", error);
      alert("Failed to make call: " + error.message);
      setCallStatus("");
    }
  };

  const disconnectCall = () => {
    if (activeCall) {
      try {
        console.log("Manually disconnecting call...");
        console.log("Call object methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(activeCall)));
        console.log("Call object keys:", Object.keys(activeCall));

        // Try different disconnect methods
        if (typeof activeCall.disconnect === 'function') {
          console.log("Using call.disconnect()");
          activeCall.disconnect();
        } else if (typeof activeCall.hangup === 'function') {
          console.log("Using call.hangup()");
          activeCall.hangup();
        } else if (typeof activeCall.reject === 'function') {
          console.log("Using call.reject()");
          activeCall.reject();
        } else if (device) {
          // Try device-level disconnect methods
          if (typeof device.disconnectAll === 'function') {
            console.log("Using device.disconnectAll()");
            device.disconnectAll();
          } else if (typeof device.disconnect === 'function') {
            console.log("Using device.disconnect()");
            device.disconnect(activeCall);
          } else if (device.calls && Array.isArray(device.calls)) {
            // Try to disconnect all active calls
            console.log("Disconnecting all device calls");
            device.calls.forEach(call => {
              if (typeof call.disconnect === 'function') {
                call.disconnect();
              }
            });
          } else {
            console.warn("No disconnect method found on device, clearing state manually");
          }
        } else {
          console.warn("No device or disconnect method found, clearing state manually");
        }
      } catch (error) {
        console.error("Error disconnecting call:", error);
        // Even if disconnect fails, clear the state
      }

      // Always clear the call state immediately
      callHandledRef.current = false;
      // Use setTimeout to ensure state updates happen in the next tick
      setTimeout(() => {
        setActiveCall(null);
        setCallStatus("");
      }, 0);
    } else {
      // If no active call but status exists, clear it
      if (callStatus) {
        setCallStatus("");
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Main Card */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
            <h1 className="text-2xl font-bold mb-1">Twilio Voice</h1>
            <p className="text-blue-100 text-sm">WebRTC Calling App</p>
          </div>

          {/* Device Status */}
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">Connection Status</span>
              <div className="flex items-center gap-2">
                {deviceError ? (
                  <span className="flex items-center gap-2 text-red-600">
                    <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
                    <span className="text-sm font-medium">Error</span>
                  </span>
                ) : deviceReady ? (
                  <span className="flex items-center gap-2 text-green-600">
                    <span className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></span>
                    <span className="text-sm font-medium">Ready</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-2 text-orange-600">
                    <span className="w-2 h-2 bg-orange-600 rounded-full animate-pulse"></span>
                    <span className="text-sm font-medium">Initializing...</span>
                  </span>
                )}
              </div>
            </div>
            {deviceError && (
              <p className="text-xs text-red-500 mt-2">{deviceError}</p>
            )}
          </div>

          {/* Incoming Call Card */}
          {incomingCall && callStatus === "incoming" && (
            <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-100">
              <div className="text-center mb-6">
                <div className="relative inline-block mb-4">
                  <div className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-75"></div>
                  <div className="relative w-24 h-24 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 flex items-center justify-center">
                    <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-1">Incoming Call</p>
                <p className="text-2xl font-bold text-gray-900">{incomingCallerId || "Unknown Caller"}</p>
              </div>

              {/* Accept/Reject Buttons */}
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={rejectIncomingCall}
                  className="flex-1 py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 transition-all transform hover:scale-105 active:scale-95 shadow-lg"
                >
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <span className="text-sm">Reject</span>
                  </div>
                </button>

                <button
                  onClick={acceptIncomingCall}
                  className="flex-1 py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 transition-all transform hover:scale-105 active:scale-95 shadow-lg"
                >
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </div>
                    <span className="text-sm">Accept</span>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Call Status Card */}
          {activeCall && callStatus && callStatus !== "" && callStatus !== "disconnected" && callStatus !== "incoming" && (
            <div className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 border-b border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Calling</p>
                  <p className="text-xl font-semibold text-gray-900">{number || "Unknown"}</p>
                </div>
                <div className="relative">
                  {callStatus === "ringing" && (
                    <div className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-75"></div>
                  )}
                  <div className={`relative w-16 h-16 rounded-full flex items-center justify-center ${callStatus === "connected" ? "bg-green-500" :
                    callStatus === "ringing" ? "bg-orange-500" :
                      "bg-gray-500"
                    }`}>
                    {callStatus === "connected" ? (
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    ) : callStatus === "ringing" ? (
                      <svg className="w-8 h-8 text-white animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-center gap-3">
                <span className={`px-4 py-2 rounded-full text-sm font-medium ${callStatus === "connected" ? "bg-green-100 text-green-700" :
                  callStatus === "ringing" ? "bg-orange-100 text-orange-700" :
                    "bg-gray-100 text-gray-700"
                  }`}>
                  {callStatus === "connected" ? "Connected" : callStatus === "ringing" ? "Ringing..." : "Calling"}
                </span>
              </div>
            </div>
          )}

          {/* Main Content - Hide when incoming call */}
          {!incomingCall && (
            <div className="p-6">
              {/* Phone Number Input */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <input
                    type="tel"
                    placeholder="Enter phone number"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    disabled={!!activeCall}
                    className={`w-full pl-12 pr-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${activeCall ? "bg-gray-100 cursor-not-allowed" : "bg-white border-gray-200"
                      }`}
                  />
                </div>
              </div>

              {/* Call Button */}
              {!activeCall ? (
                <button
                  onClick={makeCall}
                  disabled={!deviceReady || !number.trim()}
                  className={`w-full py-4 rounded-xl font-semibold text-white transition-all transform hover:scale-105 active:scale-95 shadow-lg ${deviceReady && number.trim()
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                    : "bg-gray-300 cursor-not-allowed"
                    }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <span>Make Call</span>
                  </div>
                </button>
              ) : (
                <button
                  onClick={disconnectCall}
                  className="w-full py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 transition-all transform hover:scale-105 active:scale-95 shadow-lg"
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>End Call</span>
                  </div>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="mt-4 text-center text-sm text-gray-500">
          <p>Secure WebRTC calling powered by Twilio</p>
        </div>
      </div>
    </div>
  );
}

export default App;
