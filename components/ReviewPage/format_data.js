define(function (require) {
    var $ = require('jquery'),
        _ = require('lodash'),
        Validate = require('./validator');

    /**
     * 
     * @param {Array} records 
     * @param {Object} App //? App object from the main app and data 
     * @returns 
     */
    var format_data = function (records, App) {
        var allUsers = {},
            validUsers = {},      // Object to store valid users
            invalidUsers = {},    // Object to store users with errors
            csv_resources = get_csv_resources(records);

        App._csv_resources = csv_resources;

        _.each(records, function (row) {
            var current_email = row.email,
                row_type = get_row_type(row),
                new_user = null,
                new_user_extras = null,
                is_duplicate_email_in_csv = false;

            switch (row_type) {
                case 'new_user':
                    new_user = format_user(row);
                    break;
                case 'extra_row':
                    new_user_extras = format_extra_row(row);
                    break;
                case 'invalid_row':
                    console.error('Invalid row', row);
                    break;
                default:
                    console.error('Unknown row type', row);
                    break;
            }

            if (new_user) { // If the user is new add it to the allUsers object
                if (!_.has(allUsers, current_email)) { //? Check if the email is new or a duplicate.
                    allUsers[current_email] = new_user;
                } else {
                    current_email = current_email + '_' + row.extension;
                    allUsers[current_email] = new_user;
                    is_duplicate_email_in_csv = true;
                    console.error('Duplicate email found', current_email, row.first_name, row.last_name);
                }
            } else if (new_user_extras) {
                var numbersToAdd = new_user_extras.phone_number || null;
                var extToAdd = new_user_extras.extension || null;
                var hardwareToAdd = new_user_extras.hardware || null;

                if (_.has(allUsers, current_email)) {
                    //? Add numbers to users data.
                    if (numbersToAdd) {
                        allUsers[current_email].phone_number.push(numbersToAdd);
                    }

                    //? Add extension to users data.
                    if (extToAdd) {
                        allUsers[current_email].extension.push(extToAdd);
                    }

                    //? Add hardware to users data.
                    if (hardwareToAdd) {
                        allUsers[current_email].hardware.push(hardwareToAdd);
                    }
                } else {
                    console.log('   - Extra Row Ignored, no email match');
                }
            }

            var validationResult = Validate.run(allUsers[current_email], row_type, is_duplicate_email_in_csv, App),
                numbersString = allUsers[current_email].phone_number.join(', ') || 'None',
                extString = allUsers[current_email].extension.join(', ') || 'None',

                rowData = {
                    user: allUsers[current_email],
                    extras: {
                        numbers: numbersString,
                        exts: extString,
                    }
                };

            if (validationResult.isValid) {
                validUsers[current_email] = rowData;
            } else {
                rowData.errors = validationResult.errors;

                invalidUsers[current_email] = rowData;
            }
        });

        return {
            totalRecords: records.length,
            validUsers: _.values(validUsers),
            invalidUsers: _.values(invalidUsers),
            hasErrors: _.size(invalidUsers) > 0
        };
    };

    /**
         * ? Function to format the user object.
         * @param {Object} user 
         * @returns the formatted user object
         */
    function format_user(user) {
        var seat_type = _.has(user, 'seat_type') ? user.seat_type : 'standard',
            do_not_bill = _.has(user, 'do_not_bill') ? user.do_not_bill === 'yes' : false,
            includeVoicemail = _.has(user, 'include_voicemail') ? user.include_voicemail === 'yes' : true,
            in_directory = _.has(user, 'in_directory') ? user.in_directory === 'yes' : false,
            extension = _.has(user, 'extension') && user.extension !== '' ? user.extension : null,
            mac_address = _.has(user, 'mac_address') && user.mac_address !== '' ? user.mac_address : null,
            brand = _.has(user, 'brand') && user.brand !== '' ? user.brand : null,
            model = _.has(user, 'model') && user.model !== '' ? user.model : null,
            family = _.has(user, 'family') && user.family !== '' ? user.family : null,
            phone_number = _.has(user, 'phone_number') && user.phone_number !== '' ? user.phone_number : null,
            custom_notes = _.has(user, 'user_notes') && user.user_notes !== '' ? user.user_notes : '',
            password = _.has(user, 'password') && user.password !== '' ? user.password : generatePassword(12);

        if (phone_number) {
            var formattedNumber = monster.util.getFormatPhoneNumber(phone_number);

            if (formattedNumber.isValid) {
                phone_number = formattedNumber.e164Number;
            }
        }

        if (seat_type.toLowerCase().includes('virtual')) {
            seat_type = 'Virtual_Extension';
        }

        return {
            first_name: user.first_name !== '' ? user.first_name : 'Missing',
            last_name: user.last_name !== '' ? user.last_name : 'Missing',
            email: user.email,
            phone_number: phone_number !== null ? [phone_number] : [],
            extension: extension !== null ? [extension] : [],
            hardware: brand !== null && family !== null && model !== null && mac_address !== null ? [{
                brand: brand,
                model: model,
                family: family.toUpperCase(),
                mac_address: mac_address.replace(/:/g, '').toUpperCase()
            }] : [],
            seat_type: seat_type !== 'None' ? seat_type : 'Standard',
            do_not_bill: monster.util.isSuperDuper() ? do_not_bill : false,
            include_voicemail: includeVoicemail,
            in_directory: in_directory,
            custom_notes: custom_notes,
            password: password
        }
    };

    /**
     * ? Function to format extra row data of a existing user.
     * @param {Object} row 
     * @returns 
     */
    function format_extra_row(row) {
        var email = _.get(row, 'email', null),
            phone_number = _.get(row, 'phone_number', null),
            extension = _.get(row, 'extension', null),
            hardware_brand = _.get(row, 'brand', null),
            hardware_model = _.get(row, 'model', null),
            hardware_family = _.get(row, 'family', null),
            hardware_mac = _.get(row, 'mac_address', null);

        extras = {
            email: email,
            phone_number: phone_number,
            extension: extension,
        };

        if (phone_number) {
            var formattedNumber = monster.util.getFormatPhoneNumber(phone_number);

            if (formattedNumber.isValid) {
                extras.phone_number = formattedNumber.e164Number;
            }
        }

        if (hardware_brand && hardware_model) {
            extras.hardware = {
                brand: hardware_brand,
                model: hardware_model,
                family: hardware_family.toUpperCase(),
                mac_address: hardware_mac.replace(/:/g, '').toUpperCase()
            };
        }

        return extras;
    };

    function get_row_type(user) {
        var has_first_name = _.has(user, 'first_name') && user.first_name !== '',
            has_last_name = _.has(user, 'last_name') && user.last_name !== '',
            has_email = _.has(user, 'email') && user.email !== '',
            has_ext = _.has(user, 'extension') && user.extension !== '',
            has_hardware_brand = _.has(user, 'brand') && user.brand !== '',
            has_hardware_model = _.has(user, 'model') && user.model !== '',
            has_hardware_mac = _.has(user, 'mac_address') && user.mac_address !== '',
            is_new_user = has_first_name && has_last_name && has_email && has_ext;
        if (is_new_user) {
            return 'new_user';
        } else {
            var has_hardware = has_hardware_brand && has_hardware_model && has_hardware_mac,
                has_phone_number = _.has(user, 'phone_number') && user.phone_number !== '';

            if (has_email && (has_hardware || has_phone_number || has_ext)) {
                return 'extra_row';
            } else {
                return 'invalid_row';
            }
        }
    }

    function get_csv_resources(records) {
        var _csv_resources = {
            numbers: [],
            exts: [],
            emails: [],
            mac_addresses: []
        };

        // Step 1: Extract all numbers and extensions before processing users
        _.each(records.slice(0), function (row) {
            var phone_number = _.get(row, 'phone_number', null);
            var extension = _.get(row, 'extension', null);
            var email = _.get(row, 'email', null);
            var hardware = _.get(row, 'hardware', null);

            // Collect phone numbers
            if (phone_number) {
                var formattedNumber = monster.util.getFormatPhoneNumber(phone_number);

                if (formattedNumber.isValid) {
                    phone_number = formattedNumber.e164Number;
                }

                _csv_resources.numbers.push(phone_number);
            }

            // Collect extensions
            if (extension) {
                _csv_resources.exts.push(extension);
            }

            // Collect email addresses
            if (email) {
                _csv_resources.emails.push(email);
            }

            if (hardware && _.size(hardware) > 0) {
                var mac_address = _.get(hardware, 'mac_address', null);

                if (mac_address) {
                    _csv_resources.mac_addresses.push(mac_address);
                }
            }
        });

        return _csv_resources;
    }

    function generatePassword(length) {
        var chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
        var password = "";
        for (var i = 0; i < length; i++) {
            var randomIndex = Math.floor(Math.random() * chars.length);
            password += chars.charAt(randomIndex);
        }
        return password;
    }

    return format_data;
});