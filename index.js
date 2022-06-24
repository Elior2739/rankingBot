const config = require("./config.json");
const humanize = require("humanize-duration");

const { Client, Partials, PermissionFlagsBits, ChatInputCommandInteraction, ChannelType, ComponentType, TextInputBuilder, ModalBuilder, SelectMenuBuilder, ActionRowBuilder, ButtonStyle, ButtonBuilder, Colors, EmbedBuilder } = require("discord.js");
const { createPool } = require("mysql2/promise");
const client = new Client({
	intents: [
		"Guilds",
		"GuildMembers"
	],
	partials: [
		Partials.GuildMember,
		Partials.User,
		Partials.Channel
	]
});

const database = createPool(config.database);
const addChannelRow = new ActionRowBuilder().setComponents([
	new SelectMenuBuilder()
	.setCustomId("channel-select")
	.setPlaceholder("Select a category")
	.setMaxValues(1)
]);

const addChannelModal = new ModalBuilder()
	.setTitle("Add Your Server")
	.setCustomId("add_server")
	.setComponents([
		new ActionRowBuilder()
		.addComponents([
			new TextInputBuilder()
			.setCustomId("server_name")
			.setLabel("Server Name")
			.setMaxLength(32)
			.setRequired(true)
			.setStyle(1)
		]),
		new ActionRowBuilder()
		.addComponents([
			new TextInputBuilder()
			.setCustomId("server_name_short")
			.setLabel("Short name (Boy RolePlay => boyrp)")
			.setMaxLength(10)
			.setRequired(true)
			.setStyle(1)
		]),
		new ActionRowBuilder()
		.addComponents([
			new TextInputBuilder()
			.setCustomId("server_description")
			.setLabel("Server Description")
			.setMaxLength(1024)
			.setRequired(true)
			.setStyle(2)
		]),
		new ActionRowBuilder()
		.addComponents([
			new TextInputBuilder()
			.setCustomId("logo")
			.setLabel("Server's Logo")
			.setMaxLength(1024)
			.setRequired(true)
			.setStyle(1)
		]),
		new ActionRowBuilder()
		.addComponents([
			new TextInputBuilder()
			.setCustomId("link")
			.setLabel("Link to server")
			.setMaxLength(32)
		.setRequired(true)
		.setStyle(1)
	])
]);

const serverRequestButtons = new ActionRowBuilder().setComponents([
	new ButtonBuilder()
	.setCustomId("accept_server")
	.setLabel("Accept")
	.setStyle(ButtonStyle.Success),
	new ButtonBuilder()
	.setCustomId("decline_server")
	.setLabel("Decline")
	.setStyle(ButtonStyle.Danger)
]);

const voteButton = new ActionRowBuilder().setComponents([
	new ButtonBuilder()
	.setCustomId("vote")
	.setLabel("Vote")
	.setStyle(ButtonStyle.Success)
]);

const linkRegex = /(https?:\/\/[^\s]+)/g;
const currentAdders = []; // Very good name

const commands = [
	{
		name: "createcategory",
		description: "Create a new category",
		defaultMemberPermissions: PermissionFlagsBits.Administrator,
		options: [
			{
				name: "name",
				description: "The name of the category",
				required: true,
				type: 3
			}
		],
		dmPermission: false,
		/**
		 * @param {ChatInputCommandInteraction} interaction 
		 */
		execute: (interaction) => {
			const categoryName = interaction.options.getString("name", true);
			
			interaction.reply({content: "Creating category...", ephemeral: true}).then(() => {
				interaction.guild.channels.create({
					name: categoryName,
					type: ChannelType.GuildCategory,
				}).then(category => {
					database.execute("INSERT INTO `categories` (`channel`) VALUES (?)", [
						category.id
					]).then(() => {
						interaction.editReply({content: "Successfully created the category"})
					}).catch(err => {
						category.delete().catch(err => err); // fuck this
						interaction.editReply({content: "Failed to insert the category to database, The error has been logged to the console."});
						console.error(err);
					});
				}).catch(err => {
					interaction.editReply({content: "Error happened while creating category, The error has been logged to the console"});
					console.error(err);
				})
			});
		}
	},
	{
		name: "createchannel",
		description: "Add a channel to a category",
		defaultMemberPermissions: 0,
		dmPermission: false,
		/**
		 * @param {ChatInputCommandInteraction} interaction 
		 */
		execute(interaction) {
			if(currentAdders.includes(interaction.user.id)) {
				interaction.reply({content: "You are already adding a channel"});
				return;	
			}

			interaction.reply({content: "Fetching categories...", ephemeral: true}).then(() => {
				database.query("SELECT `id`, `channel` FROM `categories`").then(res => {
					const options = [];
					res = res[0];
	
					for(let i = 0; i < res.length; i++) {
						const channel = interaction.guild.channels.cache.get(res[i].channel);
						
						if(!channel) continue;
						
						options.push({
							label: channel.name,
							value: res[i].id.toString()
						});
					}
					
					if(options.length == 0) {
						interaction.editReply({content: "No categories found"});
						return;
					}
	
					currentAdders.push(interaction.user.id);
					addChannelRow.components[0].setOptions(options);

					interaction.editReply({content: "These are the categories that you can use.", components: [addChannelRow]});
					interaction.channel.awaitMessageComponent({componentType: ComponentType.SelectMenu, time: 60000, filter: (_) => _.user.id == interaction.user.id}).then(resultInteraction => {
						const categoryId = resultInteraction.values[0];

						interaction.editReply({content: "Modal has been opened for you.", components: []})
						resultInteraction.showModal(addChannelModal);
						resultInteraction.awaitModalSubmit({time: 180000, filter: (_) => _.user.id == interaction.user.id}).then(modalInteraction => {
							const name = modalInteraction.fields.getTextInputValue("server_name"), shortName = modalInteraction.fields.getTextInputValue("server_name_short"), description = modalInteraction.fields.getTextInputValue("server_description"), logo = modalInteraction.fields.getTextInputValue("logo"), link = modalInteraction.fields.getTextInputValue("link");
						
							if(!linkRegex.test(logo)) {
								currentAdders.splice(currentAdders.indexOf(interaction.user.id), 1);
								modalInteraction.reply({content: "Invalid logo link", ephemeral: true});
								return;
							}

							const message = new EmbedBuilder()
							.setAuthor({name: "Server Request."})
							.setColor(Colors.Blue)
							.setDescription("Member sent request to add his server, The info is down below.")
							.setFields([
								{
									name: "Requested by",
									value: interaction.user.tag,
									inline: true
								},
								{
									name: "Server Name",
									value: name + " (" + shortName + ")",
									inline: true
								},
								{
									name: "Server Description",
									value: description,
									inline: true
								},
								{
									name: "Server Logo",
									value: logo,
									inline: true
								},
								{
									name: "Server Link",
									value: link,
									inline: true
								}
							]);

							const requestsChannel = interaction.guild.channels.cache.get(config.channels["server-requests"]);

							if(!requestsChannel) {
								currentAdders.splice(currentAdders.indexOf(interaction.user.id), 1);
								modalInteraction.reply({content: "Failed to find the requests channel", ephemeral: true});
								return;
							} else if(requestsChannel.type != ChannelType.GuildText) {
								currentAdders.splice(currentAdders.indexOf(interaction.user.id), 1);
								modalInteraction.reply({content: "The requests channel is not a category!", ephemeral: true});
								return;
							};

							requestsChannel.send({embeds: [message], components: [serverRequestButtons]}).then(message => {
								database.execute("INSERT INTO `requests` (`category`, `name`, `shortname`, `description`, `logo`, `link`, `owner`, `message`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
									categoryId,
									name,
									shortName,
									description,
									logo,
									link,
									interaction.user.id,
									message.id
								]).then(() => {
									currentAdders.splice(currentAdders.indexOf(interaction.user.id), 1);
									modalInteraction.reply({content: "Your request has been sent", ephemeral: true});
								}).catch(err => {
									currentAdders.splice(currentAdders.indexOf(interaction.user.id), 1);
									message.delete().catch(err => err) // Fuck this
									modalInteraction.reply({content: "Failed to send your request", ephemeral: true});
									console.error(err);
								});
							}).catch(err => {
								currentAdders.splice(currentAdders.indexOf(interaction.user.id), 1);
								interaction.editReply({content: "Failed to send the message, The error has been logged to the console."});
								console.error(err);
							})
						}).catch(() => {
							currentAdders.splice(currentAdders.indexOf(interaction.user.id), 1);
							resultInteraction.editReply({content: "You failed to answer in time"});
						});
					}).catch(() => {
						currentAdders.splice(currentAdders.indexOf(interaction.user.id), 1);
						interaction.editReply({content: "You failed to answer in time", components: []});
					})
				})
			});
		}
	},
	{
		name: "deploycommands",
		description: "Deploy commands to the bot",
		defaultMemberPermissions: PermissionFlagsBits.Administrator,
		dmPermission: false,
		execute: (interaction) => {
			interaction.reply({content: "Deploying commands...", ephemeral: true}).then(() => {
				interaction.guild.commands.set(commands.map(command => { // Do not send the execute function
					return {
						name: command.name,
						description: command.description,
						defaultMemberPermissions: command.defaultMemberPermissions,
						dmPermission: command.dmPermission,
						options: command.options,
					}
				})).then(() => {
					interaction.editReply({content: "Successfully deployed commands"});
				}).catch(err => {
					interaction.editReply({content: "Failed to deploy commands, The error has been logged to the console."});
					console.error(err);
				});
			});
		}
	}
];

const interactions = {
	"accept_server": (interaction) => {
		database.query("SELECT r.name, r.shortname, r.description, r.logo, r.link, r.owner, c.channel, r.category FROM `requests` r LEFT JOIN `categories` c ON r.category = c.id WHERE `message` = ?", [interaction.message.id]).then(result => {
			result = result[0];

			if(result.length == 0) {
				interaction.reply({content: "Failed to find the request", ephemeral: true});
				return;
			}

			const requestData = result[0];
			const category = interaction.guild.channels.cache.get(requestData.channel);

			if(!category) {
				interaction.reply({content: "Failed to find the category", ephemeral: true});
				return;
			}

			category.children.create({
				name: (category.children.cache.size + 1) + "-" + requestData.shortname,
				type: ChannelType.GuildText,
				permissionOverwrites: [
					{
						id: interaction.guild.roles.everyone.id,
						deny: [PermissionFlagsBits.SendMessages]
					}
				]
			}).then(channel => {
				
				const channelEmbed = new EmbedBuilder()
				.setAuthor({name: requestData.name, iconURL: requestData.logo})
				.setDescription(requestData.description)
				.setColor(Colors.Blue)
				.setThumbnail(requestData.logo)
				.setFields([
					{
						name: "Owner",
						value: "<@" + requestData.owner + ">",
						inline: true
					},
					{
						name: "Discord Link",
						value: requestData.link,
						inline: true
					},
					{
						name: "Votes",
						value: "0",
						inline: true
					}
				]);

				channel.send({embeds: [channelEmbed], components: [voteButton]}).then(() => {
					database.execute("DELETE FROM `requests` WHERE `message` = ?", [interaction.message.id]);
					database.execute("INSERT INTO `channels` (`category`, `channel`, `owner`) VALUES(?, ?, ?)", [
						requestData.category,
						channel.id,
						requestData.owner
					]);

					interaction.message.delete();
					interaction.reply({content: "Successfully added the server", ephemeral: true});
				}).catch(err => {
					channel.delete();
					interaction.reply({content: "Failed to send the message, The error has been logged to the console.", ephemeral: true});
					console.error(err);
				})
			}).catch(err => {
				interaction.reply({content: "Failed to create the channel, The error has been logged to the console.", ephemeral: true})
				console.error(err);
			})
		})
	},

	"decline_server": (interaction) => {
		interaction.reply({content: "You declined the request", ephemeral: true});
		database.execute("DELETE FROM `requests` WHERE `message` = ?", [interaction.message.id]);
		interaction.message.delete();
	},

	"vote": (interaction) => {
		database.query("SELECT `at` FROM `votes` WHERE `user` = ?", [interaction.user.id]).then(userCooldownData => {
			userCooldownData = userCooldownData[0];

			if(userCooldownData.length > 0) {
				const roleTime = config.settings.cooldowns.votes.time_remover.reduce((acc, curr) => {
					return acc + curr.time;
				}, 0)
				
				const timePassed = Date.now() - parseInt(userCooldownData[0].at);
				
				if(timePassed <= (config.settings.cooldowns.votes.base - roleTime)) {
					interaction.reply({content: "You can vote again in " + humanize(Math.abs(config.settings.cooldowns.votes.base - roleTime - timePassed), config.settings["humanize-duration"]), ephemeral: true});
					return;
				}
			}
			
			database.query("SELECT `channels`.`id`, `channels`.`votes`, `channels`.`channel`, `votes`.`at` FROM `channels` LEFT JOIN `votes` ON `votes`.`channel` = `channels`.`id` AND `votes`.`user` = ? WHERE `channels`.`channel` = ?", [
				interaction.user.id,
				interaction.channel.id
			]).then(res => {
				res = res[0];
				
				if(res.length == 0) {
					interaction.reply({content: "Failed to find the server.. tf", ephemeral: true});
					return;
				}
	
				const channelData = res[0];

				database.execute("INSERT INTO `votes` (`channel`, `user`, `at`) VALUES(:channel, :user, :at) ON DUPLICATE KEY UPDATE at = :at, channel = :channel", {
					channel: channelData.id,
					user: interaction.user.id,
					at: Date.now()
				}).then(() => {
					database.execute("UPDATE `channels` SET `votes` = `votes` + 1 WHERE `id` = ?", [channelData.id]).then(() => {
						const embed = interaction.message.embeds[0];
		
						embed.fields[2].value = (channelData.votes + 1).toString();
						interaction.message.edit({embeds: [embed]});
						interaction.reply({content: "Successfully voted", ephemeral: true});

						const logChannel = client.channels.cache.get(config.channels["vote-logs"]);
						if(logChannel) {
							logChannel.send({embeds: [
								new EmbedBuilder()
								.setTitle("Member voted!")
								.setDescription("**" + interaction.user.tag + "** Voted for " + "<#" + interaction.channel.id + ">\nThe server now have " + (channelData.votes + 1) + " votes")
								.setColor(Colors.Blue)
								.setFooter({text: "Made by Elior#0590"})
							]}).catch(err => err);
						}
					}).catch(err => {
						console.error(err);
					});
				}).catch(err => {
					interaction.reply({content: "Failed to vote, The error has been logged to the console.", ephemeral: true});
					console.error(err);
				});
	
			})
		})
	}
};

client.once("ready", () => {
	setInterval(() => {
		database.query("SELECT `channel` FROM `channels` ORDER BY `votes` DESC").then(res => {
			res = res[0];

			if(res.length > 0) {
				for(let index = 0; index < res.length; index++) {
					const channel = client.channels.cache.get(res[index].channel);

					if(channel && channel.position != index && channel.type == ChannelType.GuildText) {
						channel.setPosition(index);
						channel.setName((index + 1) + channel.name.split(" ")[1])
					}
				}
			}
		});
	}, config.settings.servers["update-time"]);

	const guild = client.guilds.cache.get(config.client.guild);

	if(guild) {
		guild.commands.fetch().then(commands => {
			if(commands.size == 0) {
				guild.commands.set(commands.map(command => {
					return {
						name: command.name,
						description: command.description,
						defaultMemberPermissions: command.defaultMemberPermissions,
						dmPermission: command.dmPermission,
						options: command.options,
					}
				})).then(() => {
					console.log("Successfully deployed commands");
				}).catch(err => {
					console.log("Failed to deploy commands, The error has been logged to the console.");
					console.error(err);
				});
			}
		})
	}

	console.log("I'm ready, Logged in as " + client.user.tag);
});

process.on("uncaughtException", (err) => { // No no, don't crash me there.
	console.error(err);
});

client.on("channelDelete", (channel) => {
	if(channel.children != null) {
		database.query("SELECT `id` FROM `categories` WHERE channel = ?", [channel.id]).then(res => {
			res = res[0];

			if(res.length > 0 && res[0].id != null) {
				database.execute("DELETE FROM `categories` WHERE `id` = ?", [res[0].id]);
				database.execute("DELETE FROM `channels` WHERE `category` = ?", [res[0].id]);
			}
		})
	} else
		database.query("DELETE FROM `channels` WHERE `channel` = ?", [channel.id]);
});

client.on("interactionCreate", (interaction) => {
	if(interaction.isChatInputCommand()) {

		const command = commands.find(c => c.name === interaction.commandName);
		if(!command) return;

		command.execute(interaction);
	} else
		interactions[interaction.customId] && interactions[interaction.customId](interaction);
});

client.login(config.client.token);