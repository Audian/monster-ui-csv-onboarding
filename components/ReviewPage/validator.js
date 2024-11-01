define(function (require) {
    var $ = require('jquery'),
        _ = require('lodash');

    /**
     * Main function to validate the user and hardware data.
     * @param {Object} user 
     * @param {String} row_type 
     * @param {Boolean} is_duplicate_email_in_csv 
     * @param {Object} App 
     * @returns 
     */
    var run = function (user, row_type, is_duplicate_email_in_csv, App) {
        var all_errors = [],
            email = user.email,
            account_resources = App._account_resources,
            csv_resources = App._csv_resources,
            provisioner_data = App._provisionerData;

        var email_errors = validate_email(email, account_resources, is_duplicate_email_in_csv);
        all_errors = _.concat(all_errors, email_errors);

        var ext_errors = validate_ext(user, account_resources, csv_resources, row_type);
        all_errors = _.concat(all_errors, ext_errors);

        var number_errors = validate_phone_numbers(user.phone_number, account_resources, csv_resources);
        all_errors = _.concat(all_errors, number_errors);

        var hardware_errors = validate_hardware(user.hardware, account_resources, csv_resources, provisioner_data);
        all_errors = _.concat(all_errors, hardware_errors);

        var seat_type_errors = validate_seat_types(user);
        all_errors = _.concat(all_errors, seat_type_errors);

        all_errors = _.filter(all_errors, function (string) {
            if (string && string.length) {
                return string;
            }
        });

        return {
            isValid: _.isEmpty(all_errors),
            errors: all_errors
        };
    };

    //? Validate Email Address
    var validate_email = function (email, account_resources, is_duplicate_email_in_csv) {
        var errors = [];

        //? Check if email is missing or exists in the accounts
        if (email === null) {
            errors.push('Email is missing.');
            return errors;
        }

        var email_regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email_regex.test(email)) {
            errors.push('Email ' + email + ' is not a valid email address.');
        }

        //? Check if email is a duplicate on the account
        var emails_on_account = account_resources.emails;
        errors = _.concat(errors, find_duplicates([email], emails_on_account, 'Email', 'on the account.', false));

        //? Check if email in the CSV has duplicates
        if (is_duplicate_email_in_csv) {
            errors.push('Email ' + email + ' found multiple times in the CSV as a new user. Email addresses must be unique when used as a user row.');
        }

        return errors;
    };

    //? Validate Extension
    var validate_ext = function (user, account_resources, csv_resources, row_type) {
        var errors = [],
            user_exts = user.extension;

        //? New user typed row validation
        if (row_type === 'new_user') {
            if (_.isEmpty(user_exts)) {
                errors.push('Extension is missing');
                return errors;
            }
        }

        var account_exts = account_resources.exts,
            csv_exts = csv_resources.exts;

        _.each(user_exts, function (ext) {
            errors = _.concat(errors, find_duplicates([ext], account_exts, 'Extension', 'on the account.', false));
            errors = _.concat(errors, find_duplicates([ext], csv_exts, 'Extension', 'in the CSV.', true));
        });
        
        return errors;
    }

    //? Validate Phone Numbers
    var validate_phone_numbers = function (numbers, account_resources, csv_resources) {
        var errors = [];

        if (!_.isEmpty(numbers)) {
            var account_numbers_in_service = account_resources.numbers_inService,
                numbers_in_csv = csv_resources.numbers;

            _.each(numbers, function (number) {
                var formattedNumber = monster.util.getFormatPhoneNumber(number);

                if (formattedNumber.isValid) {
                    errors = _.concat(errors, find_duplicates([number], account_numbers_in_service, 'Number', 'on the account.', false));
                    errors = _.concat(errors, find_duplicates([number], numbers_in_csv, 'Number', 'in the CSV.', true));
                } else {
                    errors.push('Number ' + number + ' is not a valid phone number.');
                }
            });
        }

        return errors;
    };

    var validate_seat_types = function (user) {
        var errors = [],
            seat_type = user.seat_type,
            types = ['common', 'standard', 'virtual_extension', 'analog'];

        if (!_.includes(types, seat_type.toLowerCase())) {
            errors.push('Seat type ' + seat_type + ' is not supported.');
        }

        user.seat_type = seat_type;

        return errors;
    }

    //? Validate Hardware
    var validate_hardware = function (devices, account_resources, csv_resources, provisioner_data) {
        var errors = [];

        if (!_.isEmpty(devices)) {
            _.each(devices, function (hardware) {
                var brand = _.get(hardware, 'brand', null),
                    model = _.get(hardware, 'model', null),
                    mac_address = _.get(hardware, 'mac_address', null).toLowerCase();

                if ((brand === 'None' || model === 'None') && !_.isEmpty(mac_address)) {
                    errors.push('Brand and or model are missing.');
                    return errors;
                }

                errors = _.concat(errors, find_duplicates([mac_address], account_resources.mac_addresses, 'Mac Address', 'on the account.', false));
                errors = _.concat(errors, find_duplicates([mac_address], csv_resources.mac_addresses, 'Mac Address', 'in the CSV.', true));

                var clean_mac = mac_address.replace(/:/g, '').replace(/-/g, '').replace(/\./g, '');

                if (clean_mac.length !== 12) {
                    errors.push('Mac Address ' + mac_address + ' is not a valid.');
                }

                //? Validate Brand and Model and Family using provisioner
                errors = _.concat(errors, find_device_brand(hardware, provisioner_data, errors));
            });
        }

        return errors;
    }

    /**
     * Finds duplicates in the CSV and the account and outputs an array of error strings.
     * @param {Array} targets_list 
     * @param {Array} compare_list 
     * @param {String} name 
     * @param {String} message 
     * @param {Boolean} more_than_one This is used when comparing items on the CSV that will already contain the item being compared. 
     * @returns Array of error strings.
     */
    function find_duplicates(targets_list, compare_list, name, message, more_than_one) {
        var errors = [];

        _.each(targets_list, function (target) {
            var found = 0;

            if (_.includes(compare_list, target)) {
                if (!more_than_one) {
                    errors.push(name + ' ' + target + ' is already in use ' + message);
                } else {
                    found++;
                }
            }

            if (found > 1) {
                errors.push(name + ' ' + target + ' found multiple times ' + message);
            }
        });

        return errors;
    };

    function find_device_brand(device, provisionerData, errors) {
        var deviceBrand = {},
            brand = _.get(device, 'brand', null);

        if (!brand) {
            errors.push('Brand ' + device.brand + ' is not a device brand we support.');
            return errors;
        }

        brand = brand.toLowerCase();

        if (brand.length && brand !== 'none') {
            deviceBrand = _.find(provisionerData, function (_brand) { //Returns the device brand if it is a match.
                return _brand.id === brand; //If there is a match it will return that brand.
            });

            if (!_.isEmpty(deviceBrand)) {
                find_device_family(device, deviceBrand, errors);
            } else {
                errors.push('Brand ' + brand + ' is not a device brand we support.');
                return errors;
            }
        }
    };

    function find_device_family(record, brand, errors) {
        var family = _.get(record, 'family', null);

        if (!family) {
            errors.push('Device family ' + record.family + ' is not supported.');
            return errors;
        }

        family = family.toLowerCase();

        var deviceFamily = _.find(brand.families, function (_family) {
            return _family.name === family;
        });

        if (!_.isEmpty(deviceFamily)) {
            find_device_model(record, deviceFamily, errors);
        } else {
            errors.push('Device family ' + family + ' i is not supported.');
            return errors;
        }
    };

    function find_device_model(record, family, errors) {
        var model = _.get(record, 'model', null);

        if (!model) {
            errors.push('Device model ' + record.model + ' is not supported.');
            return errors;
        }

        model = model.toString().toLowerCase();

        var models = Object.getOwnPropertyNames(family.models),
            deviceModel = _.find(models, function (_model) {
                return _model === model;
            });

        if (_.isEmpty(deviceModel)) {
            errors.push('Device model ' + model + ' is not supported.');
        }

        return errors;
    };

    return {
        run: run
    }
});
