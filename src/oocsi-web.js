var OOCSI = (function() {

    var wsUri = "ws://localhost/ws";
    var username;
    var handlers = {};
    var responders = {};
    var calls = {};
    var websocket;

    var interview;
    var components;
    // var connected = false;
    var logger = internalLog;
    var error = internalError;

    function init() {
        logger("CONNECTING to " + wsUri);
        websocket = new WebSocket(wsUri);
        websocket.onopen = function(evt) {
            onOpen(evt)
        };
        websocket.onclose = function(evt) {
            onClose(evt)
        };
        websocket.onmessage = function(evt) {
            onMessage(evt)
        };
        websocket.onerror = function(evt) {
            onError(evt)
        };
    }

    function onOpen(evt) {
        if (websocket.readyState === WebSocket.OPEN) {
            submit(username);
        }
        logger("CONNECTED");
    }

    function onClose(evt) {
        logger("DISCONNECTED");
    }

    function onMessage(evt) {
        if (evt.data !== 'ping') {
            try {
                var e = JSON.parse(evt.data);
                if (e.data.hasOwnProperty('_MESSAGE_ID') && calls.hasOwnProperty(e.data['_MESSAGE_ID'])) {
                    var c = calls[e.data['_MESSAGE_ID']];

                    if ((+new Date) < c.expiration) {
                        delete e.data['_MESSAGE_ID'];
                        c.fn(e.data);
                    }

                    delete calls[e.data['_MESSAGE_ID']];
                } else if (handlers[e.recipient] !== undefined) {
                    handlers[e.recipient](e);
                } else {
                    logger('no handler for event: ' + evt.data);
                }
            } catch (e) {
                logger('ERROR: parse exception for event data ' + evt.data);
            }
            logger('RESPONSE: ' + evt.data);
        } else if (evt.data.length > 0) {
            websocket.send(".");
        }
    }

    function onError(evt) {
        error();
        logger('ERROR: ' + evt);
    }

    function waitForSocket(fn) {
        if (!websocket || websocket.readyState === WebSocket.CONNECTING) {
            setTimeout(function() { waitForSocket(fn) }, 200);
        } else {
            fn();
        }
    }

    function submit(message) {
        if (websocket && websocket.send(message)) {
            logger("SENT: " + message);
        }
    }

    function internalClose() {
        websocket && websocket.close();
    }

    function internalLog(message) {
        // do nothing by default
    }

    function internalError() {
        // do nothing by default
    }

    function internalConnected() {
        return websocket.readyState === WebSocket.OPEN;
    }

    function internalSend(client, data) {
        internalConnected() && submit('sendjson ' + client + ' ' + JSON.stringify(data));
    }

    function internalCall(call, data, timeout, fn) {
        if (internalConnected()) {
            var uuid = guid();
            calls[uuid] = { expiration: (+new Date) + timeout, fn: fn };
            data['_MESSAGE_ID'] = uuid;
            data['_MESSAGE_HANDLE'] = call;
            submit('sendjson ' + call + ' ' + JSON.stringify(data));
        }
    }

    function internalRegister(call, fn) {
        if (internalConnected()) {
            responders[call] = { fn: fn };
            internalSubscribe(call, function(e) {
                var response = { '_MESSAGE_ID': e.data['_MESSAGE_ID'] };
                fn(e.data, response);
                internalSend(e.sender, response);
            });
        }
    }

    function internalSubscribe(channel, fn) {
        if (internalConnected()) {
            submit('subscribe ' + channel);
            handlers[channel] = fn;
        }
    }

    function internalUnsubscribe(channel) {
        if (internalConnected()) {
            submit('unsubscribe ' + channel);
            handlers[channel] = function() {};
        }
    }

    function guid() {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
        }
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
    }

    function create_greeting(prototype_name) {
        interview = { prototype_name: {} };
        interview['prototype_name']["properties"] = {};
        interview['prototype_name']["location"] = {};
        interview['prototype_name']["components"] = {};
        components = interview['prototype_name']["components"]
    }

    return {
        connect: function(server, clientName, fn) {
            wsUri = server;
            username = clientName && clientName.length > 0 ? clientName : "webclient_" + +(new Date());
            handlers[clientName] = fn;
            init();
        },
        send: function(recipient, data) {
            waitForSocket(function() {
                internalSend(recipient, data);
            });
        },
        call: function(call, data, timeout, fn) {
            waitForSocket(function() {
                internalCall(call, data, timeout, fn);
            });
        },
        register: function(call, fn) {
            waitForSocket(function() {
                internalRegister(call, fn);
            });
        },
        subscribe: function(channel, fn) {
            waitForSocket(function() {
                internalSubscribe(channel, fn);
            });
        },
        unsubscribe: function(channel) {
            waitForSocket(function() {
                internalUnsubscribe(channel);
            });
        },
        variable: function(channel, name) {
            var listeners = [];
            var value;

            function notify(newValue) {
                listeners.forEach(function(listener) { listener(newValue); });
            }

            function accessor(newValue) {
                if (arguments.length && newValue !== value) {
                    value = newValue;
                    notify(newValue);

                    // send new value to OOCSI
                    internalSend(channel, { name: value });
                }
                return value;
            }

            accessor.subscribe = function(listener) { listeners.push(listener); };

            // subscribe to OOCSI for getting external updates on value
            this.subscribe(channel, function(e) { if (e.data.hasOwnProperty(name)) { accessor(e.data[name]) } });

            return accessor;
        },
        isConnected: function() {
            return internalConnected();
        },
        close: function() {
            waitForSocket(function() {
                internalClose();
            });
        },
        handlers: function() {
            return handlers;
        },
        logger: function(fn) {
            logger = fn;
        },
        error: function(fn) {
            error = fn;
        },


        heyoocsi: function(prototype_name) {
            create_greeting(prototype_name);
            logger('added heyoocsi device');
        },


        add_property: function(properties, propertyValue) {
            interview['prototype_name']["properties"][properties] = propertyValue;
        },
        add_location: function(location, latitude, longitude) {
            interview['prototype_name']["properties"][location] = [latitude, longitude];
        },
        add_sensor_brick: function(sensor_name, sensor_channel, sensor_type, sensor_unit, sensor_default, icon = None) {
            components[sensor_name] = {}
            components[sensor_name]["channel_name"] = sensor_channel
            components[sensor_name]["type"] = "sensor"
            components[sensor_name]["sensor_type"] = sensor_type
            components[sensor_name]["unit"] = sensor_unit
            components[sensor_name]["value"] = sensor_default
            components[sensor_name]["icon"] = icon
                // self._oocsi.log(f 'Added {sensor_name} to the components list.')
        },
        add_number_brick: function(number_name, number_channel, number_min_max, number_unit, number_default, icon = None) {
            components[number_name] = {}
            components[number_name]["channel_name"] = number_channel
            components[number_name]["min_max"] = number_min_max
            components[number_name]["type"] = "number"
            components[number_name]["unit"] = number_unit
            components[number_name]["value"] = number_default
            components[number_name]["icon"] = icon
                // prototype[self._prototype_name]["components"] | self._components[number_name]
                // self._oocsi.log(f 'Added {number_name} to the components list.')
        },
        add_binary_sensor_brick: function(sensor_name, sensor_channel, sensor_type, sensor_default = False, icon = None) {
            components[sensor_name] = {}
            components[sensor_name]["channel_name"] = sensor_channel
            components[sensor_name]["type"] = "binary_sensor"
            components[sensor_name]["sensor_type"] = sensor_type
            components[sensor_name]["state"] = sensor_default
            components[sensor_name]["icon"] = icon
                // self._prototype[self._prototype_name]["components"] | self._components[sensor_name]
                // self._oocsi.log(f 'Added {sensor_name} to the components list.')
        },
        add_switch_brick: function(switch_name, switch_channel, switch_type, switch_default = False, icon = None) {
            components[switch_name] = {}
            components[switch_name]["channel_name"] = switch_channel
            components[switch_name]["type"] = "switch"
            components[switch_name]["sensor_type"] = switch_type
            components[switch_name]["state"] = switch_default
            components[switch_name]["icon"] = icon
                // self._prototype[self._prototype_name]["components"] | self._components[switch_name]
                // self._oocsi.log(f 'Added {switch_name} to the components list.')
        },
        add_light_brick: function(light_name, light_channel, led_type, spectrum, light_default_state = False, light_default_brightness = 0, mired_min_max = None, icon = None) {
            components[light_name] = {}
            components[light_name]["channel_name"] = light_channel
            components[light_name]["min_max"] = mired_min_max
            components[light_name]["type"] = "light"
            components[light_name]["ledType"] = led_type
            components[light_name]["spectrum"] = spectrum
            components[light_name]["state"] = light_default_state
            components[light_name]["brightness"] = light_default_brightness
            components[light_name]["icon"] = icon
                // self._prototype[self._prototype_name]["components"] | self._components[light_name]
                // self._oocsi.log(f 'Added {light_name} to the components list.')
        },
        submit: function() {
            internalSend("heyOOCSI!", interview)

        }
    };

})();

var heyOOCSI = (function() {

    return {


    }
});