define(function(require) {
	var $ = require('jquery'),
		_ = require('lodash'),
		monster = require('monster'),
		Papa = require('papaparse');

	var app = {
		css: ['app'],

		i18n: {
			'de-DE': { customCss: false },
			'en-US': { customCss: false }
		},

		appFlags: {
			csvOnboarding: {
				columns: {
					mandatory: ['first_name', 'last_name', 'password', 'email', 'extension'],
					optional: ['mac_address', 'brand', 'family', 'model', 'softphone']
				},
				users: {
					smartPBXCallflowString: ' SmartPBX\'s Callflow',
					smartPBXVMBoxString: '\'s VMBox'
				}
			}
		},

		requests: {
			/* Provisioner */
			'common.chooseModel.getProvisionerData': {
				apiRoot: monster.config.api.provisioner,
				url: 'phones',
				verb: 'GET'
			}
		},

		subscribe: {},

		load: function(callback) {
			var self = this;

			self.initApp(function() {
				callback && callback(self);
			});
		},

		initApp: function(callback) {
			var self = this;

			monster.pub('auth.initApp', {
				app: self,
				callback: callback
			});
		},

		// Entry Point of the app
		render: function(container) {
			var self = this;

			monster.ui.generateAppLayout(self, {
				menus: [
					{
						tabs: [
							{
								text: self.i18n.active().csvOnboarding.title,
								callback: self.csvOnboardingRender
							}
						]
					}
				]
			});
		},

		csvOnboardingRender: function(pArgs) {
			var self = this,
				args = pArgs || {},
				container = args.container || $('#csv_onboarding_app_container .app-content-wrapper'),
				mainTemplate = $(self.getTemplate({ name: 'layout' }));
			console.log('csv Render');
			self.uploadsRender(mainTemplate);

			container
				.fadeOut(function() {
					$(this)
						.empty()
						.append(mainTemplate)
						.fadeIn();
				});
		},

		uploadsRender: function(container) {
			var self = this,
				template = $(self.getTemplate({ name: 'upload' }));

			self.bindUploadEvents(template);

			container.find('.content-wrapper')
				.empty()
				.append(template);
		},

		bindUploadEvents: function(template) {
			var self = this,
				file,
				handleFileSelect = function(evt) {
					file = evt.target.files[0];
					onFileSelected(file);
				},
				onFileSelected = function(file) {
					var isValid = file.name.match('.+(.csv)$');

					if (isValid) {
						template.find('.file-name').text(file.name);
						template.find('.selected-file').show();
						template.find('.upload-frame').hide();
						template.find('.start-job-action').removeAttr('disabled');
					} else {
						var text = self.getTemplate({
							name: '!' + self.i18n.active().csvOnboarding.uploads.errors.wrongType,
							data: {
								type: file.type
							}
						});

						monster.ui.alert('error', text);

						onInvalidFile();
					}
				},
				onInvalidFile = function() {
					file = undefined;
					template.find('.start-job-action').attr('disabled', 'disabled');
				},
				addJob = function() {
					if (file) {
						Papa.parse(file, {
							header: true,
							skipEmptyLines: true,
							complete: function(results) {
								var formattedData = {
									fileName: file.name,
									records: results.data,
									columns: {
										expected: {
											mandatory: self.appFlags.csvOnboarding.columns.mandatory,
											optional: self.appFlags.csvOnboarding.columns.optional
										},
										actual: results.meta.fields
									}
								};
								console.log('3 Add Job formattedData', formattedData);
								self.renderReview(formattedData);
							}
						});
					}
				};

			//template.find('#upload_csv_file').change(handleFileSelect);
			template.find('#upload_csv_file').on('change', function(e) {
				handleFileSelect(e);
				console.log('1 upload click');
			});

			template.find('#proceed').on('click', function() {
				addJob();
				console.log('2 proceed click');
			});

			template.find('.text-upload').on('click', function() {
				template.find('#upload_csv_file').trigger('click');
			});

			template.find('.undo-upload').on('click', function(e) {
				template.find('.file-name').text('');
				template.find('.selected-file').hide();
				template.find('.upload-frame').show();
				onInvalidFile();

				e.stopPropagation();
			});

			var container = template.find('.upload-frame').get(0);

			container.ondragover = function(e) {
				template.find('.upload-frame').addClass('hover');
				return false;
			};
			container.ondragleave = function(e) {
				template.find('.upload-frame').removeClass('hover');
				return false;
			};
			container.ondrop = function(e) {
				template.find('.upload-frame').removeClass('hover');
				e.preventDefault();

				file = e.dataTransfer.files[0];
				onFileSelected(file);
				return false;
			};
		},

		renderReview: function(data) {
			var self = this,
				parent = $('#csv_onboarding_app_container'),
				templateData = self.prepareReviewData(data),
				template = $(self.getTemplate({
					name: 'review',
					data: templateData
				}));

			self.bindReview(template, data);

			parent.find('.content-wrapper')
				.empty()
				.append(template);
		},

		bindReview: function(template, data) {
			var self = this,
				expectedColumns = data.columns.expected;

			monster.ui.footable(template.find('.footable'), {
				filtering: {
					enabled: false
				}
			});

			console.log('4 bindReview data', data);

			monster.request({
				resource: 'common.chooseModel.getProvisionerData',
				data: {},
				success: function(dataProvisioner) {
					self.findDeviceBrand(data, dataProvisioner, template);
				}
			});

			template.find('#proceed').on('click', function() {
				var columnsMatching = self.getColumnsMatching(template),
					resultCheck = self.checkValidColumns(columnsMatching, expectedColumns);

				if (resultCheck.isValid) {
					var formattedData = self.formatTaskData(columnsMatching, data),
						hasCustomizations = template.find('.has-customizations').prop('checked');

					if (hasCustomizations) {
						self.renderCustomizations(formattedData.data, function(customizations) {
							self.startProcess(formattedData.data, customizations);
						});
					} else {
						self.startProcess(formattedData.data, {});
					}
				} else {
					var msg = self.i18n.active().csvOnboarding.review.errors.title + '<br/><br/>';

					_.each(resultCheck.errors, function(v, category) {
						_.each(v, function(column) {
							msg += column + ': ' + self.i18n.active().csvOnboarding.review.errors[category] + '<br/>';
						});
					});

					monster.ui.alert('error', msg);
				}
			});

			template.find('#cancel').on('click', function() {
				self.csvOnboardingRender();
			});
		},

		findDeviceBrand: function(redcordData, provisionerData, template) {
			var self = this,
				deviceBrand = {},
				brandError = 'brand';

			_.each(redcordData.records, function(record) {
				if (record.brand !== '') {
					console.log('1 dataProvisioner.data', provisionerData.data);
					console.log('1 data.records.data', redcordData.records);

					deviceBrand = _.find(provisionerData.data, function(brand) { //Returns the device brand if it is a match.
						record.brand = record.brand.toLowerCase();
						brand.name === record.brand ? record.provision = true : record.provision = false; //Sets the provision status to true or false.
						return brand.name === record.brand; //If there is a match it will return that brand.
					});

					if (record.brand !== 'none') { //Catches brands labeled as none so that the app does not throw an error or call findDeviceFamily.
						if (record.provision === true) { //Verifies if the device is valid
							console.log('Brand Found');
							self.findDeviceFamily(record, deviceBrand, template); //Calls the next function to verify the family.
						} else {
							self.deviceInvalid(record, template, brandError); //Otherwise throws an error.
						}
					}
				} else {
					self.deviceInvalid(record, template, brandError); //If the brand field is empty it will throw an error. 
				}
			});
		},

		deviceInvalid: function(data, template, errorMessage) {
			var self = this;

			var text = self.getTemplate({
				name: '!' + self.i18n.active().csvOnboarding.uploads.errors.message,
				data: {
					fName: data.first_name,
					lName: data.last_name,
					error: errorMessage
				}
			});
			monster.ui.alert('error', text);

			template.find('#proceed').attr('disabled', 'disabled');
		},

		findDeviceFamily: function(record, brand, template) {
			var self = this,
				deviceFamily = {},
				familyError = 'family';

			console.log('2 Record', record);
			console.log('2 Family', brand.families);

			deviceFamily = _.find(brand.families, function(family) {
				console.log('!Family', family);
				record.family = record.family.toLowerCase();
				family.name === record.family ? record.provision = true : record.provision = false; //Sets the status to true or false.
				return family.name === record.family;
			});

			console.log('2 deviceFamily', deviceFamily);
			console.log('2 record.provision', record.provision);
			
			if (record.provision === true) {
				self.findDeviceModel(record, deviceFamily, template);
			} else {
				self.deviceInvalid(record, template, familyError);
			}
		},

		findDeviceModel: function(record, family, template) {
			var self = this,
				modelError = 'model';
			
			console.log('3 Family', family);
			console.log('3 Model', family.models);

			var models = Object.getOwnPropertyNames(family.models);

			_.find(models, function(model) {
				model === record.model ? record.provision = true : record.provision = false; //Sets the status to true or false.
				console.log('! End record.provision', record.provision);
				return model === record.model;
			});

			if (record.provision === false) {
				self.deviceInvalid(record, template, modelError);
			}
			console.log('COMPLETED');
		},

		createSmartPBXData: function(formattedData, customizations, onProgress) {
			var self = this,
				parallelRequests = [],
				totalRequests,
				countFinishedRequests = 0,
				dataProgress;

			self.usersGetMainDirectory(function(directory) {
				var directory = {
					directories: directory.id
				};

				_.each(formattedData, function(record) {
					_.extend(record, directory);
					parallelRequests.push(function(callback) {
						var data = self.formatUserData(record, customizations);
						self.createSmartPBXUser(data, function(dataUser) {
							dataProgress = {
								countFinishedRequests: countFinishedRequests++,
								totalRequests: totalRequests
							};
							onProgress(dataUser, dataProgress);

							callback && callback(null, dataUser);
						});
					});
				});

				totalRequests = parallelRequests.length;

				monster.parallel(parallelRequests, function(err, results) {
					self.showResults(results);
				});
			});
		},

		startProcess: function(data, customizations) {
			var self = this,
				template = $(self.getTemplate({
					name: 'progress',
					data: {
						totalRequests: data.length
					}
				}));

			$('#csv_onboarding_app_container').find('.content-wrapper')
				.empty()
				.append(template);

			self.createSmartPBXData(data, customizations, function(user, progress) {
				var percentFilled = Math.ceil((progress.countFinishedRequests / progress.totalRequests) * 100);
				template.find('.count-requests-done').html(progress.countFinishedRequests);
				template.find('.count-requests-total').html(progress.totalRequests);
				template.find('.inner-progress-bar').attr('style', 'width: ' + percentFilled + '%');
			});
		},

		renderCustomizations: function(data, onContinue) {
			var self = this,
				parent = $('#csv_onboarding_app_container'),
				template = $(self.getTemplate({
					name: 'customizations'
				})),
				getJson = function(str) {
					try {
						return JSON.parse(str);
					} catch (e) {
						return {};
					}
				};

			template.find('textarea').on('keyup', function() {
				var $this = $(this),
					val = $this.val(),
					jsonValue = getJson(val);

				if (!_.isEmpty(jsonValue)) {
					$this.siblings('.json-result').empty();
					monster.ui.renderJSON(jsonValue, $this.siblings('.json-result'));
				}
			});

			template.find('.continue').on('click', function() {
				var customizations = {
					user: getJson(template.find('textarea[data-type="user"]').val()),
					device: getJson(template.find('textarea[data-type="device"]').val()),
					vmbox: getJson(template.find('textarea[data-type="vmbox"]').val())
				};

				onContinue && onContinue(customizations);
			});

			parent.find('.content-wrapper')
				.empty()
				.append(template);
		},

		showResults: function(results) {
			var self = this;
			/*var self = this,
				parent = $('#csv_onboarding_app_container'),
				template = $(self.getTemplate({
					name: 'results',
					data: results
				}));

			monster.ui.footable(template.find('.footable'));

			parent.find('.content-wrapper')
					.empty()
					.append(template);*/

			/*{
				provision: {
					combo_keys: {
						0: {type: "line"},
						1: {type: "parking", value: "1"},
						2: {type: "parking", value: "2"}
					}
				}
			}*/
			monster.ui.toast({
				type: 'success',
				message: 'Congratulations, you successfully imported data to this account!'
			});

			self.csvOnboardingRender();
		},

		formatTaskData: function(columnsMatching, data) {
			var self = this,
				formattedRecords = [],
				formattedElement,
				formattedData = {
					fileName: data.fileName
				};
			console.log('formatTaskData data START', data);
			_.each(data.records, function(record) {
				formattedElement = {};

				_.each(columnsMatching, function(backendColumn, frontendColumn) {
					if (backendColumn !== '_none') {
						formattedElement[backendColumn] = record[frontendColumn];
					}
				});

				formattedRecords.push(formattedElement);
			});
			formattedData.data = formattedRecords;
			//console.log('formatTaskData data END', formattedData.data);

			return formattedData;
		},

		getColumnsMatching: function(template) {
			var self = this,
				mappings = {},
				$this;

			template.find('.review-table-wrapper tr.footable-header th.column-data').each(function() {
				$this = $(this);
				mappings[$this.data('column')] = $this.find('.column-selector').val();
			});

			return mappings;
		},

		checkValidColumns: function(columns, requiredColumns) {
			var self = this,
				mapColumns = {
					mandatory: {},
					optional: {}
				},
				isValid = true,
				errors = {
					missing: [],
					tooMany: []
				};

			_.each(requiredColumns, function(category, categoryName) {
				mapColumns[categoryName] = {};

				_.each(category, function(column) {
					mapColumns[categoryName][column] = 0;
				});
			});

			_.each(columns, function(column) {
				if (mapColumns.mandatory.hasOwnProperty(column)) {
					mapColumns.mandatory[column]++;
				}

				if (mapColumns.optional.hasOwnProperty(column)) {
					mapColumns.optional[column]++;
				}
			});

			_.each(mapColumns.mandatory, function(count, column) {
				if (count !== 1) {
					errors[count === 0 ? 'missing' : 'tooMany'].push(column);

					isValid = false;
				}
			});

			_.each(mapColumns.optional, function(count, column) {
				if (count > 1) {
					errors.tooMany.push(column);

					isValid = false;
				}
			});

			return {
				isValid: isValid,
				errors: errors
			};
		},

		prepareReviewData: function(data) {
			var formattedData = {
				data: {
					fileName: data.fileName,
					totalRecords: data.records.length,
					columns: {
						actual: data.columns.actual,
						expected: data.columns.expected
					},
					recordsToReview: data.records.slice(0, 5)
				}
			};

			// remove extra data not parsed properly
			_.each(formattedData.data.recordsToReview, function(record) {
				delete record.__parsed_extra;
			});

			formattedData.data.columns.others = [];

			var occurences;

			// for each column in the csv, we check if it's one of the column mandatory or optional in that job.
			// If not, then we add it to the list of 'Others' columns to choose from
			// This was added so users can submit their extra column they need to keep in the database, such as billing ids etc...
			_.each(data.columns.actual, function(actualColumnName) {
				occurences = 0;
				_.each(data.columns.expected, function(expectedColumnGrp) {
					if (expectedColumnGrp && expectedColumnGrp.indexOf(actualColumnName) >= 0) {
						occurences++;
					}
				});

				if (occurences === 0 && formattedData.data.columns.others.indexOf(actualColumnName) < 0) {
					formattedData.data.columns.others.push(actualColumnName);
				}
			});

			return formattedData;
		},

		createSmartPBXUser: function(data, success, error) {
			var self = this,
				formattedResult = {
					device: {},
					user: {},
					vmbox: {},
					callflow: {}
				};
			//console.log('1 createSmartPBXUserDevice data', data);
			self.callApi({
				resource: 'user.create',
				data: {
					accountId: self.accountId,
					data: data.user
				},
				success: function(_dataUser) {
					formattedResult.user = _dataUser.data;

					var userId = _dataUser.data.id;
					data.user.id = userId;
					data.vmbox.owner_id = userId;
					data.device.owner_id = userId;
					monster.parallel({
						vmbox: function(callback) {
							self.createVMBox(data.vmbox, function(_dataVM) {
								callback(null, _dataVM);
							});
						},
						device: function(callback) {
							console.log('Data', data);
							if (data.rawData.brand !== 'none') { //Detects if there is a valid device.
								self.createDevice(data.device, function(_dataDevice) { //Create device
									callback(null, _dataDevice);
								});
							} else {
								callback(null); //Otherwise do not create a device.
							}
						},
						softphone: function(callback) {
							if (data.rawData.softphone === 'yes') { //Detects if the user needs a softphone
								self.createSoftPhone(data.user, function(_dataSoftPhone) { //Create softphone
									//console.log('Softphone Data AFTER API CALL', _dataSoftPhone);
									
									callback(null, _dataSoftPhone);
								});
							} else {
								callback(null); //Otherwise do not create a softphone.
							}
						}
					}, function(err, results) {
						//console.log('Results After API requests', results);
						formattedResult.vmbox = results.vmbox;
						formattedResult.device = results.device;
						formattedResult.softphone = results.softphone;

						data.callflow.owner_id = userId;
						data.callflow.type = 'mainUserCallflow';
						data.callflow.flow.data.id = userId;
						data.callflow.flow.children._.data.id = results.vmbox.id;

						self.createCallflow(data.callflow, function(_dataCF) {
							var dirConstructor = {
									directories: {}
								},
								dirID = {};

							formattedResult.callflow = _dataCF;
							dirID[data.rawData.directories] = _dataCF.id; //directory id: callflow id
							formattedResult.directories = dirID;

							$.extend(dirConstructor.directories, dirID);
							$.extend(data.user, dirConstructor);

							self.usersUpdateUser(data.user);
							//console.log('3 formattedResult', formattedResult);
							success(formattedResult);
						});
					});
				},
				error: function() {
					error();
				}
			});
		},

		createVMBox: function(data, callback) {
			var self = this;

			self.callApi({
				resource: 'voicemail.create',
				data: {
					accountId: self.accountId,
					data: data
				},
				success: function(data) {
					callback(data.data);
				}
			});
		},

		createCallflow: function(data, callback) {
			var self = this;

			self.callApi({
				resource: 'callflow.create',
				data: {
					accountId: self.accountId,
					data: data
				},
				success: function(data) {
					callback(data.data);
				}
			});
		},

		createDevice: function(data, callback) {
			var self = this;

			self.callApi({
				resource: 'device.create',
				data: {
					accountId: self.accountId,
					data: data
				},
				success: function(data) {
					callback(data.data);
				}
			});
		},

		createSoftPhone: function(data, callback) {
			//console.log('createSoftPhone data', data);
			var self = this,
				formattedDeviceData = {
					device_type: 'softphone',
					owner_id: data.id,
					enabled: true,
					name: data.first_name + ' ' + data.last_name + ' - softphone',
					sip: {
						password: monster.util.randomString(12),
						username: 'user_' + monster.util.randomString(10)
					}
				};

			//console.log('2 createSoftPhone formattedDeviceData', formattedDeviceData);
			
			self.callApi({
				resource: 'device.create',
				data: {
					accountId: self.accountId,
					data: formattedDeviceData
				},
				success: function(data) {
					callback(data.data);
				}
			});
		},

		usersUpdateUser: function(user) {
			var self = this;

			self.callApi({
				resource: 'user.update',
				data: {
					accountId: self.accountId,
					userId: user.userId,
					data: user
				},
				success: function(data) {
				}
			});
		},

		usersGetMainDirectory: function(callback) {
			var self = this;

			self.usersListDirectories(function(listDirectories) {
				var indexMain = -1;

				_.each(listDirectories, function(directory, index) {
					if (directory.name === 'SmartPBX Directory') {
						indexMain = index;

						return false;
					}
				});

				if (indexMain === -1) {
					self.usersCreateMainDirectory(function(data) {
						callback(data);
					});
				} else {
					callback && callback(listDirectories[indexMain]);
				}
			});
		},

		usersListDirectories: function(callback) {
			var self = this;

			self.callApi({
				resource: 'directory.list',
				data: {
					accountId: self.accountId,
					filters: {
						paginate: 'false'
					}
				},
				success: function(data) {
					callback && callback(data.data);
				}
			});
		},

		usersCreateMainDirectory: function(callback) {
			var self = this,
				dataDirectory = {
					confirm_match: false,
					max_dtmf: 0,
					min_dtmf: 3,
					name: 'SmartPBX Directory',
					sort_by: 'last_name'
				};

			self.callApi({
				resource: 'directory.create',
				data: {
					accountId: self.accountId,
					data: dataDirectory
				},
				success: function(data) {
					callback && callback(data.data);
				}
			});
		},

		formatUserData: function(data, customizations) {
			var self = this,
				fullName = data.first_name + ' ' + data.last_name,
				callerIdName = fullName.substring(0, 15),
				formattedData = {
					rawData: data,
					user: $.extend(true, {}, customizations.user, {
						first_name: data.first_name,
						last_name: data.last_name,
						password: data.password,
						username: data.email,
						send_email_on_creation: false,
						caller_id: {
							internal: {
								name: callerIdName,
								number: data.extension
							}
						},
						presence_id: data.extension,
						email: data.email
						//directory: data.directories
					}),
					device: $.extend(true, {}, customizations.device, {
						device_type: 'sip_device',
						enabled: true,
						mac_address: data.mac_address.toLowerCase(),
						name: data.first_name + ' ' + data.last_name + ' - ' + data.brand + ' ' + data.model,
						provision: {
							endpoint_brand: data.brand,
							endpoint_family: data.family,
							endpoint_model: data.model
						},
						sip: {
							password: monster.util.randomString(12),
							username: 'user_' + monster.util.randomString(10)
						}
					}),
					vmbox: $.extend(true, {}, customizations.vmbox, {
						mailbox: data.extension,
						name: fullName + self.appFlags.csvOnboarding.users.smartPBXVMBoxString
					}),
					callflow: {
						contact_list: {
							exclude: false
						},
						flow: {
							children: {
								_: {
									children: {},
									data: {},
									module: 'voicemail'
								}
							},
							data: {
								can_call_self: false,
								timeout: 20
							},
							module: 'user'
						},
						name: fullName + self.appFlags.csvOnboarding.users.smartPBXCallflowString,
						numbers: [data.extension]
					}
				};
			return formattedData;
		}
	};

	return app;
});
