define(function (require) {
    var $ = require('jquery'),
        _ = require('lodash'),
        riff = require('riff'),
        monster = require('monster'),
        Papa = require('papaparse'),
        magpieSDK = require('magpieSDK'),
        FeatureKeys = require('./FeatureKeysPage');

    var CreateResourcesPage = {
        render: function (App) {
            var Users = App.Users.validUsers,
                content = App._selectors.content,
                template = $(App.getTemplate({
                    name: 'create-resources-loading',
                }));

            content
                .fadeOut(function () {
                    $(this)
                        .empty()
                        .append(template)
                        .fadeIn();
                });

            resource_creation_manager(App, Users, function (_) {
                monster.ui.confirm('Resources have been created. Would you like to export a CSV with the user data? If users passwords were generated randomly you may want to save this to reduce users not being able to login.', 
                    function () {
                        downloadCSV(Users);
                    });
                
                render_table(App, Users);
            });
        },
    };

    var resource_creation_manager = function (App, Users, parent_callback) {
        var id_lists = {
            users: [],
            vmBoxes: [],
            devices: [],
            numbers: []
        },
            progression = 0,
            progression_intervals = 100 / Users.length;

        var bulkApiArgs = {
            groupByData: _.map(Users, function (data, index) {
                return {
                    id: index,
                    apiData: {
                        accountId: App.accountId,
                        data: data.user

                    },
                    childParallelFunc: function (args) { //? is the apiData arg above.
                        var child = {
                            user: function (child_callback) {
                                var user = args.data,
                                    accountId = args.accountId;

                                create_user(user, accountId, App, function (err, new_user) {
                                    user.created = {
                                        user: 'failed',
                                        vmbox: 'failed',
                                        hardware: 'failed',
                                        callflow: 'failed',
                                        notes: 'failed',
                                        directory: 'failed',
                                    }

                                    if (err) { //? If errors are found, set them in user object. This will be used on the front end to display errors.
                                        console.error('Error', err);

                                        progression += progression_intervals; //? Progress bar incrementation.
                                        $('#loadingBar').css('width', progression + '%');

                                        child_callback(err, null);
                                        return;
                                    }

                                    var id = new_user.id,
                                        hardware = user.hardware;

                                    user.created.user = 'created';
                                    user.id = id;

                                    App._account_resources.userOptions.push({ //? Add user to the userOptions array to use in drop-downs for feature keys.
                                        id: id,
                                        name: user.first_name + ' ' + user.last_name,
                                    });

                                    id_lists.users.push(id);

                                    monster.parallel({
                                        vmbox: function (resources_callback) {
                                            if (user.include_voicemail) {
                                                create_vm_box(user, accountId, id_lists, App, function (err, data) {
                                                    if (err) {
                                                        resources_callback(err, null);
                                                        return;
                                                    }

                                                    user.created.vmbox = 'created';
                                                    resources_callback(null, data);
                                                });
                                            } else {
                                                user.created.vmbox = 'skipped';
                                                resources_callback(null, null);
                                            }
                                        },

                                        hardware: function (resources_callback) {
                                            if (hardware && hardware.length > 0) {
                                                device_creation_manager(hardware, user, id_lists, App, function (err, results) {
                                                    if (err) {
                                                        resources_callback(err, null);
                                                        return;
                                                    }

                                                    user.created.hardware = 'added';
                                                    resources_callback(null, results);
                                                });
                                            } else {
                                                user.created.hardware = 'skipped';
                                                resources_callback(null, null);
                                            }
                                        }
                                    }, function (main_errors, results) {
                                        var vm_id = _.get(results, 'vmbox.id', null);

                                        create_callflow(user, vm_id, id_lists, App, function (err, data) {
                                            progression += progression_intervals; //? Progress bar incrementation.
                                            $('#loadingBar').css('width', progression + '%');

                                            if (err) {
                                                console.error('Error', err);
                                                child_callback(err, null);
                                                return;
                                            }

                                            var data_to_patch = {
                                                callflowId: data.id,
                                                directoryId: _.get(App._account_resources.directory, 'id', undefined),
                                            },
                                                has_custom_notes = _.has(user, 'custom_notes') && user.custom_notes.length > 0,
                                                include_in_directory = _.has(user, 'in_directory') && user.in_directory;

                                            user.created.callflow = 'created';

                                            if (has_custom_notes || include_in_directory) {
                                                patch_user(data_to_patch, user, App, function (err, data) {
                                                    child_callback(main_errors, new_user);

                                                });
                                            } else {
                                                if (!has_custom_notes) {
                                                    user.created.notes = 'skipped';
                                                }

                                                if (!include_in_directory) {
                                                    user.created.directory = 'skipped';
                                                }

                                                child_callback(main_errors, new_user);
                                            }
                                        });
                                    });
                                });
                            }
                        }

                        return child;
                    }
                }
            })
        }

        riff.util.bulkApi(bulkApiArgs, function (returnData) {
            if (_.has(App, 'locationId') && App.locationId) {
                assignLocations(id_lists, App.locationId, App.accountId, function (err, magpie_results) {
                    parent_callback(returnData);
                });
            } else {
                parent_callback(returnData);
            }
        });

    };

    var render_table = function (App, Users) {
        var formattedData = {
            success: [],
            error: []
        };

        _.each(Users, function (_data) { //? Loop through the users and check if they have any errors and sort them.
            var user = _data.user,
                created = user.created,
                fail_count = 0;

            _.each(created, function (status) {
                if (status === 'failed') {
                    fail_count++;
                }
            });

            if (_.has(user, 'hardware') && user.hardware.length > 0) {
                var hardware = user.hardware;

                _.each(hardware, function (device) {
                    if (_.has(device, 'created') && device.created === 'failed') {
                        fail_count++;
                    }
                });
            }

            if (fail_count > 0) {
                formattedData.error.push(_data);
            } else {
                formattedData.success.push(_data);
            }
        });

        var table_template = $(App.getTemplate({
            name: 'create-resources-page',
            data: {
                users: formattedData,
                failedCount: formattedData.error.length,
                successCount: formattedData.success.length
            }
        }));

        //? Create the rows of users that have errors and append them so they are at the top of the page.
        if (formattedData.error.length > 0) {
            var error_rows_template = $(App.getTemplate({
                name: 'summary-table-rows',
                data: {
                    users: formattedData.error,
                    status: 'error'
                }
            }));

            table_template.find('.table-body').append(error_rows_template);
        }

        //? Create the rows of users that were successful and append them so they are at the bottom of the page.
        if (formattedData.success.length > 0) {
            var success_rows_template = $(App.getTemplate({
                name: 'summary-table-rows',
                data: {
                    users: formattedData.success,
                    status: 'success'
                }
            }));

            table_template.find('.table-body').append(success_rows_template);
        }

        App._selectors.content
            .fadeOut(function () {
                $(this)
                    .empty()
                    .append(table_template)
                    .fadeIn();
            });

        table_template.find('#add_deature_keys').on('click', function () {
            FeatureKeys.render(Users, App);
        });
    };

    //? Create User
    var create_user = function (user, accountId, App, callback) {
        var seatType = user.seat_type.toLowerCase() || 'standard';
        var seatTypeSettings = {
            standard: { standardSeat: true, commonSeat: false, virtual_ext: false, analog: false },
            common: { standardSeat: false, commonSeat: true, virtual_ext: false, analog: false },
            virtual_extension: { standardSeat: false, commonSeat: false, virtual_ext: true, analog: false },
            analog: { standardSeat: false, commonSeat: false, virtual_ext: false, analog: true }
        };
        var provisionSettings = _.get(seatTypeSettings, seatType, seatTypeSettings.standard);
        
        provisionSettings.doNotBill = _.get(user, 'do_not_bill', false);

        App.callApi({
            resource: 'user.create',
            skipLocations: true,
            data: {
                accountId: accountId,
                data: {
                    first_name: user.first_name,
                    last_name: user.last_name,
                    email: user.email,
                    username: user.email,
                    send_email_on_creation: false,
                    presence_id: user.extension[0],
                    password: user.password,
                    provision: provisionSettings,
                    caller_id: {
                        internal: {
                            name: user.first_name + ' ' + user.last_name,
                            number: user.extension[0]
                        }
                    },
                    custom_notes: user.custom_notes || '',
                }
            },
            success: function (data, status) {
                callback(null, data.data);
            },
            error: function (status) {
                callback(status, null);
            }
        });
    };

    //? Create Devices Manager
    var device_creation_manager = function (hardware, user, id_lists, App, parent_callback) {
        var parallel_tasks = {};

        _.forEach(hardware, function (device, index) {
            parallel_tasks[index] = function (parallel_callback) {
                create_device(device, 'sip_device', user, App, function (err, new_device_data) {
                    if (err) {
                        console.error('Error', err);
                        parallel_callback(err, null);
                        return;
                    }

                    id_lists.devices.push(new_device_data.id);

                    parallel_callback(null, new_device_data);
                });
            };
        });

        monster.parallel(parallel_tasks, function (err, results) {
            parent_callback(err, results);
        });
    };

    //? Create Device
    var create_device = function (hardware, device_type, user, App, callback) {
        var device_data = null;

        if (device_type === 'sip_device') {
            var formatted_model = hardware.model.toLowerCase();

            if (parseInt(hardware.model) === NaN) {
                formatted_model = parseInt(hardware.model);
            }

            device_data = {
                enabled: true,
                name: user.first_name + ' ' + user.last_name + ' ' + hardware.brand +  ' ' + hardware.model,
                owner_id: user.id,
                device_type: 'sip_device',
                sip: {
                    username: user.extension[0],
                    password: monster.util.randomString(12),
                },
                mac_address: hardware.mac_address.toLowerCase(),
                provision: {
                    endpoint_brand: hardware.brand.toLowerCase(),
                    endpoint_family: hardware.family.toLowerCase(),
                    endpoint_model: formatted_model,
                },
                sip: {
                    password: monster.util.randomString(12),
                    username: 'user_' + monster.util.randomString(10)
                }
            }
        }

        App.callApi({
            resource: 'device.create',
            skipLocations: true,
            data: {
                accountId: App.accountId,
                data: device_data
            },
            success: function (data, status) {
                if (hardware) {
                    hardware.created = true;
                }

                hardware.id = data.data.id;

                callback(null, data.data);
            },
            error: function (status) {
                callback(status, null);
            }
        });
    };

    var create_callflow = function (user, vm_id, id_lists, App, callback) {
        var id = user.id,
            nums_and_exts = _.concat(user.extension, user.phone_number),
            vm_flow = {};

        if (vm_id) {
            vm_flow = {
                _: {
                    data: {
                        id: vm_id,
                    },
                    module: 'voicemail',
                    children: {},
                }
            }
        };

        App.callApi({
            resource: 'callflow.create',
            skipLocations: true,
            data: {
                accountId: App.accountId,
                data: {
                    name: user.first_name + ' ' + user.last_name + '\'s SmartPBX Callflow',
                    type: 'mainUserCallflow',
                    numbers: nums_and_exts,
                    owner_id: id,
                    flow: {
                        children: vm_flow,
                        data: {
                            id: id,
                        },
                        module: 'user'
                    }
                }
            },
            success: function (data) {
                _.each(user.phone_number, function (num) {
                    id_lists.numbers.push(num);
                });

                callback(null, data.data);
            },
            error: function (status) {
                callback(status, null);
            }
        });
    }

    var create_vm_box = function (user, accountId, id_lists, App, callback) {
        var id = user.id;

        App.callApi({
            resource: 'voicemail.create',
            skipLocations: true,
            data: {
                accountId: accountId,
                data: {
                    name: user.first_name + ' ' + user.last_name + '\'s VMBox',
                    mailbox: user.extension[0],
                    owner_id: id
                }
            },
            success: function (data) {
                id_lists.vmBoxes.push(data.data.id);

                callback(null, data.data);
            },
            error: function (status) {
                callback(status, null);
            }
        });
    }

    var patch_user = function (data_to_patch, user, App, callback) {
        var callflowId = data_to_patch.callflowId,
            directoryId = data_to_patch.directoryId,
            id = user.id,
            has_custom_notes = _.has(user, 'custom_notes') && user.custom_notes.trim().length > 0,
            include_in_directory = _.get(user, 'in_directory', false),
            data_to_patch = {};

        if (has_custom_notes) {
            data_to_patch.smartpbx = {
                custom_notes: {
                    enabled: true
                }
            }
        };

        if (include_in_directory && directoryId && callflowId) {
            var dirConstructor = {
                directories: {}
            },
                dirID = {};

            dirID[directoryId] = callflowId;
            dirConstructor.directories = dirID;

            _.extend(data_to_patch, dirConstructor);
        }

        App.callApi({
            resource: 'user.patch',
            data: {
                accountId: App.accountId,
                userId: id,
                data: data_to_patch
            },
            success: function (data) {
                var user_data = data.data,
                    created_notes = has_custom_notes && user_data.smartpbx.custom_notes,
                    added_to_directory = include_in_directory && _.get(user_data.directories, directoryId) === callflowId;

                if (has_custom_notes) {
                    if (created_notes) {
                        user.created.notes = 'added';
                    }
                } else {
                    user.created.notes = 'skipped';
                }

                if (include_in_directory) {
                    if (added_to_directory) {
                        user.created.directory = 'added';
                    } else {
                        user.created.directory = 'failed';
                        console.error('Error', 'Failed to add user to directory, it is most likely that the directory with the name "SmartPBX Directory" does not exist.');
                    }
                } else {
                    user.created.directory = 'skipped';
                }

                callback(null, true);
            },
            error: function (data) {
                callback(data, false);
            }
        });
    };

    function assignLocations(list, locationId, accountId, main_callback) {
        monster.parallel({
            user: function (callback) {
                if (list.users.length > 0) {
                    magpieSDK.assignToLocation({
                        accountId: accountId,
                        locationId: locationId,
                        resource: 'users',
                        data: list.users,
                    }, function (data, error) {
                        callback(error ? error : null, data);
                    });
                } else {
                    callback(null, {});
                }
            },
            devices: function (callback) {
                if (list.devices.length > 0) {
                    magpieSDK.assignToLocation({
                        accountId: accountId,
                        locationId: locationId,
                        resource: 'devices',
                        data: list.devices,
                    }, function (data, error) {
                        callback(error ? error : null, data);
                    });
                } else {
                    callback(null, {});
                }
            },
            numbers: function (callback) {
                if (list.numbers.length > 0) {
                    magpieSDK.assignToLocation({
                        accountId: accountId,
                        locationId: locationId,
                        resource: 'numbers',
                        data: list.numbers,
                    }, function (data, error) {
                        callback(error ? error : null, data);
                    });
                } else {
                    callback(null, {});
                }
            },
            vmbox: function (callback) {
                if (list.vmBoxes.length > 0) {
                    magpieSDK.assignToLocation({
                        accountId: accountId,
                        locationId: locationId,
                        resource: 'vmbox',
                        data: list.vmBoxes,
                    }, function (data, error) {
                        callback(error ? error : null, data);
                    });
                } else {
                    callback(null, {});
                }
            },
        }, function (err, magpie_results) {
            main_callback(err, magpie_results);
        });
    };

    function downloadCSV(users) {
        // Format data for CSV
        var csvData = users.map(function(data) {
            var user = data.user;

            return {
                "First Name": user.first_name,
                "Last Name": user.last_name,
                "Email": user.email,
                "Extension": user.extension.join(', '),
                "Phone Number": user.phone_number.join(', '),
                "Password": user.password
            };
        });
    
        // Convert to CSV using Papa Parse
        var csv = Papa.unparse(csvData);
    
        // Create a Blob from the CSV data
        var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    
        // Create a download link
        var link = document.createElement("a");
        if (link.download !== undefined) { // feature detection
            var url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", "Audian_Users_Summary.csv");
            link.style.visibility = "hidden";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    return CreateResourcesPage;
});