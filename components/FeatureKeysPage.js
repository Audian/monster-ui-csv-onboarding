define(function (require) {
    var $ = require('jquery'),
        _ = require('lodash'),
        monster = require('monster'),
        riff = require('riff');

    var render = function (Users, App) {
        var parent = App._selectors.content;

        get_device_feature_key_iteration_groups(Users, function (err, results) {
            var device_iteration_list = results.device_iteration_list,
                models_list = results.models_list,
                featureKeys = {},
                featureKeyGroups = {},
                unsupportedDevices = [],
                keyTypes = {
                    none: 'None',
                    presence: 'Presence',
                    parking: 'Parking',
                    personal_parking: 'Personal Parking',
                    speed_dial: 'Speed Dial'
                },
                parkingSpots = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
                userOptions = _.get(App._account_resources, 'userOptions', []),
                maxKeys = 0,
                keyCount = 1;

            //? Find the max number of keys from the device iteration list
            _.each(device_iteration_list, function (_, iteration) {
                var iteration_num = parseInt(iteration);

                if (parseInt(iteration_num) > maxKeys) {
                    maxKeys = iteration_num;
                }
            });

            //? Create the feature key groups by chunking the different device iteration counts and create the keys for each iteration.
            //? This is done to group the devices by the number of feature keys they support and sort which devices do and do not support feature keys.
            _.each(device_iteration_list, function (data, iteration) {
                if (!featureKeyGroups[iteration]) {
                    if (iteration !== '0') {
                        featureKeyGroups[iteration] = {
                            devices: [],
                            keys: []
                        };
                    }

                    for (var i = keyCount; i <= iteration; i++) {
                        if (keyCount <= maxKeys) {
                            featureKeyGroups[iteration].keys.push({
                                type: 'none',
                                index: keyCount
                            });

                            keyCount++;
                        }
                    }

                    _.each(data, function (brand, _brand_name) {
                        _.each(brand, function (family, family_name) {
                            _.each(family, function (model_name) {
                                var brand_name = _brand_name.charAt(0).toUpperCase() + _brand_name.slice(1),
                                    device_name = brand_name + ' ' + family_name.toUpperCase() + ' ' + model_name;

                                if (iteration === '0') {
                                    unsupportedDevices.push(device_name);
                                } else {
                                    if (!_.includes(featureKeyGroups[iteration].devices, device_name)) {
                                        featureKeyGroups[iteration].devices.push(device_name);
                                    }
                                }
                            });
                        });
                    });
                }
            });

            var sortedUserOptions = userOptions.length > 0 ? userOptions.sort(function (a, b) {
                return a.name.localeCompare(b.name);
            }): [];

            var feature_key_template = $(App.getTemplate({
                name: 'feature-keys-page',
                data: {
                    groups: featureKeyGroups,
                    hasUnsupportedDevices: unsupportedDevices.length > 0,
                    unsupportedDevices: unsupportedDevices,
                    parkingSpots: parkingSpots,
                    keyTypes: keyTypes,
                    userOptions: sortedUserOptions
                }
            }));

            feature_key_template.find('.type-value-container').removeClass('hidden').hide(); //? Hide all type-value-containers

            bind_events(featureKeys, models_list, Users, feature_key_template, App);

            parent
                .fadeOut(function () {
                    $(this)
                        .empty()
                        .append(feature_key_template)
                        .fadeIn();
                });
        });
    };

    var bind_events = function (featureKeys, models_list, Users, feature_key_template, App) {
        feature_key_template.find('#add_keys').on('click', function () {
            var devices_to_update = [];

            _.each(Users, function (data) {
                var user = data.user,
                    hardware = user.hardware;

                _.each(hardware, function (device) {
                    var id = _.get(device, 'id', null),
                        brand = device.brand.toLowerCase(),
                        model = device.model,
                        family = device.family.toLowerCase(),
                        maxKeys = _.get(models_list, [brand, family, model, 'iterate'], 0);

                    if (maxKeys !== '0' && id) {
                        var device_data = {
                            id: id,
                            provision: {
                                feature_keys: {}
                            }
                        }

                        for (var i = 1; i <= maxKeys; i++) {
                            if (_.has(featureKeys, i)) {
                                var key = featureKeys[i],
                                    key_type = key.type,
                                    key_value = key.value;

                                if (key_type === 'speed_dial') {
                                    key_value = key.value + ':' + key.number;
                                }

                                device_data.provision.feature_keys[i - 1] = {
                                    type: key_type,
                                    value: key_value
                                };
                            }
                        }

                        devices_to_update.push(function (callback) {
                            App.callApi({
                                resource: 'device.patch',
                                data: {
                                    accountId: App.accountId,
                                    deviceId: id,
                                    data: device_data
                                },
                                success: function (apiData, status) {
                                    callback(null, apiData);
                                }
                            });
                        });
                    }
                });
            });

            if (devices_to_update.length > 0) {
                monster.parallel(devices_to_update, function (err, results) {
                    if (!err) {
                        monster.ui.toast({
                            type: 'success',
                            message: 'Feature keys successfully updated'
                        });

                        App.render();
                    }
                });
            }
        });

        feature_key_template.find('.key-type').on('change', function () {
            var type = $(this).val(),
                row = $(this).parents('.row'),
                index = row.data('row'),
                key_type = row.find('.key-type').val(),
                target = row.find('.type-value-container[data-type="' + type + '"]'),
                target_value = target.find('.type-value').val();

            row.find('.type-value-container').hide();
            target.fadeIn('slow')

            if (key_type === 'none') {
                if (_.has(featureKeys, index)) {
                    delete featureKeys[index];
                }
            } else {
                featureKeys[index] = {
                    type: key_type,
                    value: target_value
                };
            }
        });

        feature_key_template.find('.type-value').on('change', function () {
            var value = $(this).val(),
                row = $(this).parents('.row'),
                index = row.data('row'),
                key_type = row.find('.key-type').val();

            featureKeys[index] = {
                type: key_type,
                value: value
            };
        });

        feature_key_template.find('.type-value-number').on('change', function () {
            var value = $(this).val(),
                row = $(this).parents('.row'),
                index = row.data('row');

            featureKeys[index].number = value;
        });
    };

    var get_device_feature_key_iteration_groups = function (Users, parent_callback) {
        var models_list = {},
            parallel_requests = [];

        _.each(Users, function (user) {
            _.each(user.user.hardware, function (device) {
                if (device.created) {
                    var brand = device.brand.toLowerCase(),
                        model = device.model,
                        family = device.family.toLowerCase();

                    if (!models_list[brand]) {
                        models_list[brand] = {};
                    };


                    if (!models_list[brand][family]) {
                        models_list[brand][family] = {};
                    }

                    if (!models_list[brand][family][model]) {
                        var model_constructor = {};

                        model_constructor[model] = {
                            iterate: 0
                        };

                        _.extend(models_list[brand][family], model_constructor);
                    }
                }
            });
        });

        _.each(models_list, function (brand, brand_name) {
            _.each(brand, function (family, family_name) {
                _.each(family, function (model, model_name) {
                    parallel_requests.push(function (callback) {
                        monster.request({
                            resource: 'data.template.feature_keys.iteration',
                            data: {
                                brand: brand_name,
                                family: family_name,
                                model: model_name
                            },
                            success: function (apiData, status) {
                                model.iterate = apiData.data.template.feature_keys.iterate;

                                callback(null, apiData);
                            }
                        });
                    });
                });
            });
        });

        monster.parallel(parallel_requests, function (err, results) {
            var key_device_groups = {};

            _.each(models_list, function (brand, brand_name) {
                _.each(brand, function (family, family_name) {
                    _.each(family, function (model, model_name) {
                        var iterate = model.iterate;

                        if (iterate) {
                            if (!key_device_groups[iterate]) {
                                key_device_groups[iterate] = {};
                            }

                            if (!key_device_groups[iterate][brand_name]) {
                                key_device_groups[iterate][brand_name] = {};
                            }

                            if (!key_device_groups[iterate][brand_name][family_name]) {
                                key_device_groups[iterate][brand_name][family_name] = [];
                            }

                            key_device_groups[iterate][brand_name][family_name].push(model_name);
                        }
                    });
                });
            });

            parent_callback(null, {
                device_iteration_list: key_device_groups,
                models_list: models_list
            });
        });
    };

    return {
        render: render
    };
});