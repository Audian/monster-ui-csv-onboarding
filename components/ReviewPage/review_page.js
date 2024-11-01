define(function (require) {
    var $ = require('jquery'),
        _ = require('lodash'),
        format_data = require('./format_data');
    CreateResourcesPage = require('../CreateResourcesPage');

    var ReviewPage = {
        render: function (App) {
            var content = App._selectors.content;

            // 1 - Get Account Data
            get_account_data(App, function (account_resources) {
                var records = App._records;

                App._account_resources = account_resources;

                // 2 - Format Data
                var users_data = format_data(records, App),
                    hasErrors = users_data.hasErrors,
                    validUsers = users_data.validUsers,
                    invalidUsers = users_data.invalidUsers;

                App.Users = users_data;

                // 3 - Render Templates
                var template = $(App.getTemplate({
                    name: 'review-page',
                    data: {
                        hasErrors: hasErrors
                    }
                }));

                if (!_.isEmpty(validUsers)) {
                    var successTabTemplate = $(App.getTemplate({
                        name: 'user-table',
                        data: _.extend({
                            users: validUsers,
                            tableType: 'success'
                        })
                    }));

                    template.find('.success-tab .success-content')
                        .empty()
                        .append(successTabTemplate);
                }

                if (!_.isEmpty(invalidUsers)) {
                    var errorTabTemplate = $(App.getTemplate({
                        name: 'user-table',
                        data: _.extend({
                            users: invalidUsers,
                            tableType: 'error'
                        })
                    }));

                    template.find('#proceed').hide();

                    template.find('.error-tab .error-content')
                        .empty()
                        .append(errorTabTemplate);
                } else {
                    template.find('#proceed').show();
                }

                bind_events(App, template);

                content
                    .fadeOut(function () {
                        $(this)
                            .empty()
                            .append(template)
                            .fadeIn();
                    })
            });
        }
    };

    function bind_events(App, template) {
        template.find('#proceed').on('click', function () {
            CreateResourcesPage.render(App);
        });

        template.find('#cancel').on('click', function () {
            App.refreshApp(App);
        });
    };

    function get_account_data(App, callback) {
        monster.parallel({
            users: function (callback) {
                App.callApi({
                    resource: 'user.list',
                    data: {
                        accountId: App.accountId,
                        filters: {
                            paginate: 'false'
                        }
                    },
                    success: function (data) {
                        var emailList = [],
                            extInUse = [],
                            userList = {};

                        _.each(data.data, function (user) {
                            emailList.push(user.email);

                            if (_.has(user, 'presence_id')) {
                                extInUse.push(user.presence_id);
                            }

                            userList[user.email] = user;
                        });

                        callback(null, {
                            extInUse: extInUse,
                            emailList: emailList,
                            userList: userList
                        });
                    }
                });
            },

            numbers: function (callback) {
                App.callApi({
                    resource: 'numbers.list',
                    data: {
                        accountId: App.accountId,
                        filters: {
                            paginate: 'false'
                        }
                    },
                    success: function (data) {
                        var numbersInUse = [],
                            numbersAvailable = [],
                            allNumbers = [];

                        if (data.data.cascade_quantity > 0) {
                            _.each(data.data.numbers, function (num, key) {
                                var in_use = _.has(num, 'used_by');

                                allNumbers.push(key);

                                if (in_use) {
                                    numbersInUse.push(key);
                                } else {
                                    numbersAvailable.push(key);
                                }
                            });
                        }

                        callback(null, {
                            inUse: numbersInUse,
                            available: numbersAvailable,
                            allNumbers: allNumbers
                        });
                    }
                });
            },

            devices: function (callback) {
                App.callApi({
                    resource: 'device.list',
                    data: {
                        accountId: App.accountId,
                        filters: {
                            paginate: 'false'
                        }
                    },
                    success: function (data) {
                        var mac_addresses = [];

                        _.each(data.data, function (device) {
                            mac_addresses.push(device.mac_address);
                        });

                        callback(null, mac_addresses);
                    }
                });
            },

            directory: function (callback) {
                App.callApi({
                    resource: 'directory.list',
                    data: {
                        accountId: App.accountId,
                        filters: {
                            paginate: 'false'
                        }
                    },
                    success: function (data) {
                        var listDirectories = data.data,
                            indexMain = -1;

                        _.each(listDirectories, function (directory, index) {
                            if (directory.name === 'SmartPBX Directory') {
                                indexMain = index;

                                return false;
                            }
                        });

                        if (indexMain === -1) {
                            create_main_directory(function (data) {
                                callback(null, data);
                            });
                        } else {
                            callback(null, listDirectories[indexMain]);
                        }
                    }
                });

                function create_main_directory(callback) {
                    var dataDirectory = {
                            confirm_match: false,
                            max_dtmf: 0,
                            min_dtmf: 3,
                            name: 'SmartPBX Directory',
                            sort_by: 'last_name'
                        };
        
                    App.callApi({
                        resource: 'directory.create',
                        data: {
                            accountId: App.accountId,
                            data: dataDirectory
                        },
                        success: function (data) {
                            callback && callback(null, data.data);
                        }
                    });
                };
            }
        }, function (err, results) {
            callback({
                emails: results.users.emailList,
                exts: results.users.extInUse,
                mac_addresses: results.devices,
                numbers_inService: results.numbers.inUse,
                numbers_available: results.numbers.available,
                all_numbers: results.numbers.allNumbers,
                directory: results.directory,
                userOptions: _.map(results.users.userList, function (user) {
                    return {
                        id: user.id,
                        name: user.first_name + ' ' + user.last_name
                    }
                })
            });
        });
    }

    return ReviewPage;
});