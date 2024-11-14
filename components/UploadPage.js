define(function (require) {
    var $ = require('jquery'),
        _ = require('lodash'),
        Papa = require('papaparse'),
        ReviewPage = require('./ReviewPage/review_page');

    var UploadPage = {
        render: function (App) {
            var content = App._selectors.content,
                template = $(App.getTemplate({ name: 'upload-page' }));

            App.refreshApp = UploadPage.render;

            template.find('.selected-file').hide();

            UploadPage.bind_events(App, template);

            content
                .empty()
                .append(template);
        },

        bind_events: function (App, template) {
            var file,
                locationId = null,
                fileDropArea = template.find('.upload-frame'),
                fileInput = template.find('#upload_csv_file');

            dragAndDropHander();

            template.find('#proceed').on('click', function () {
                var hasMultiLocations = _.get(monster, 'billing_locations', false);

                if (!hasMultiLocations) {
                    renderReviewPage();
                } else {
                    //? Billing Location Addition
                    UploadPage.getLocationId(App, function (location_id) {
                        if (location_id === false) {
                            monster.ui.alert('error', 'A location is required in order to progress. Please select a location and try again');
                            return;
                        } else {
                            locationId = location_id;
                            renderReviewPage();
                        }
                    });
                }
            });

            function renderReviewPage() {
                if (file) {
                    Papa.parse(file, {
                        skipEmptyLines: true,
                        preview: 3,
                        complete: function (results) { //? Parsing the first 3 rows to determine where the header is. One version of the CSV file has the header in the 3rd row.
                            var rows = results.data,
                                startRow = 0;

                            _.each(rows, function (row, index) {
                                if (isHeaderRow(row)) {
                                    startRow = index;
                                }
                            });

                            function isHeaderRow(row) {
                                return row.includes('first_name') && row.includes('last_name') && row.includes('email');
                            }

                            Papa.parse(file, { //? Parsing the entire file with the correct header row.
                                header: true,
                                skipEmptyLines: true,
                                beforeFirstChunk: function(chunk) {
                                    // Split the data into rows
                                    var rows = chunk.split(/\r\n|\n/);

                                    // Remove the rows before the header row
                                    rows.splice(0, startRow);
                
                                    // Rejoin the rows
                                    return rows.join("\n");
                                },
                                complete: function (results) {
                                    var cleanedData = results.data.filter(function (row, index) {
                                         // Filter out rows where all fields are empty, null, or only whitespace
                                         return Object.keys(row).some(function (key) {
                                            var value = row[key];
                                            return value && value.trim() !== '';
                                        });
                                    });

                                    App._records = cleanedData;
                                    App.locationId = locationId;  //? Billing Location Addition
        
                                    ReviewPage.render(App);
                                }
                            });
                        },
                    });
                }
            }

            function dragAndDropHander() {
                fileDropArea.on('drop', function (e) {
                    e.preventDefault();
                    fileDropArea.removeClass('dragover');

                    var files = e.originalEvent.dataTransfer.files;

                    if (files.length > 0) {
                        selectedFileDisplayReset(function () {
                            fileHandler(files[0]); // Only handle the first file
                        });
                    }
                });

                fileDropArea.on('dragover', function (e) {
                    e.preventDefault();
                    fileDropArea.addClass('dragover');
                });

                fileDropArea.on('dragleave', function (e) {
                    e.preventDefault();
                    fileDropArea.removeClass('dragover');
                });

                fileDropArea.on('click', function (e) {
                    fileInput[0].click();
                });

                fileInput.on('change', function (e) {
                    var files = e.currentTarget.files;

                    if (files.length > 0) {
                        selectedFileDisplayReset(function () {
                            fileHandler(files[0]); // Only handle the first file
                        });
                    }
                });
            }

            function fileHandler(_file) {
                var fileName = _file.name,
                    isValidFile = _file.name.match('.+(.csv)$');

                if (isValidFile) {
                    template.find('.file-name').text(fileName);
                    template.find('.selected-file[data-type="success"]').fadeIn();
                    template.find('#proceed').removeAttr('disabled');

                    file = _file;
                } else {
                    template.find('.file-name').text(fileName);
                    template.find('.selected-file[data-type="error"]').fadeIn();

                    file = undefined;
                }
            }

            function selectedFileDisplayReset(callback) {
                template.find('#proceed').attr('disabled', 'disabled');

                template.find('.selected-file[data-type="success"]').fadeOut('fast', function () {
                    template.find('.selected-file[data-type="error"]').fadeOut('fast', function () {
                        template.find('.file-name').text('');

                        callback && callback();
                    });
                });
            }
        },

        //? Get the billing location ID by rendering the location selection popup.
        getLocationId: function (App, callback) {  //? Billing Location Addition
            monster.pub('audian_commons.billingLocations.render', {
                accountId: App.accountId,
                type: 'get',
                requestSuccessCallback: function (data) {
                    callback(data.data.locationId);
                },
                requestErrorCallback: function () {
                    callback(false);
                }
            });
        },
    };

    return UploadPage;
});