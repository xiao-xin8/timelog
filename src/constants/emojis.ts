/**
 * 表情库（Slice 13d）
 *
 * **整段复制自 `legacy/uniapp/pages/community/chat/emojis.js`**，只做了
 * TypeScript 化（补类型标注），数据和逻辑一个字没动 ——
 * 293 个表情手抄一遍必然错几个。
 *
 * 用的是**系统 Emoji 字符**而不是图片资源，所以没有体积问题，
 * 也不用管多套皮肤。
 */

/** 一个表情 */
export interface EmojiItem {
  /** 英文 id，如 `grinning` —— `[emoji:grinning]` 这种标记里用的就是它 */
  id: string;
  char: string;
  name: string;
}

/** 一个分类 */
export interface EmojiCategory {
  id: string;
  name: string;
  emojis: EmojiItem[];
}


const EMOJI_CATEGORIES: EmojiCategory[] = [
	{
		id: 'smileys',
		name: '表情',
		emojis: [
			{ id: 'grinning', char: '😀', name: ' grinning' },
			{ id: 'grin', char: '😁', name: ' grin' },
			{ id: 'joy', char: '😂', name: '笑哭' },
			{ id: 'rofl', char: '🤣', name: 'ROFL' },
			{ id: 'smiley', char: '😃', name: 'smiley' },
			{ id: 'smile', char: '😄', name: '微笑' },
			{ id: 'sweat_smile', char: '😅', name: '汗' },
			{ id: 'laughing', char: '😆', name: '大笑' },
			{ id: 'wink', char: '😉', name: '眨眼' },
			{ id: 'blush', char: '😊', name: '害羞' },
			{ id: 'yum', char: '😋', name: '好吃' },
			{ id: 'sunglasses', char: '😎', name: '酷' },
			{ id: 'heart_eyes', char: '😍', name: '花痴' },
			{ id: 'kissing_heart', char: '😘', name: '飞吻' },
			{ id: 'kissing', char: '😗', name: '亲亲' },
			{ id: 'kissing_smiling_eyes', char: '😙', name: '微笑吻' },
			{ id: 'kissing_closed_eyes', char: '😚', name: '闭眼吻' },
			{ id: 'relaxed', char: '☺️', name: '放松' },
			{ id: 'slightly_smiling_face', char: '🙂', name: '微笑' },
			{ id: 'hugging_face', char: '🤗', name: '拥抱' },
			{ id: 'star_struck', char: '🤩', name: '崇拜' },
			{ id: 'thinking', char: '🤔', name: '思考' },
			{ id: 'face_with_raised_eyebrow', char: '🤨', name: '怀疑' },
			{ id: 'neutral_face', char: '😐', name: '中性' },
			{ id: 'expressionless', char: '😑', name: '无语' },
			{ id: 'no_mouth', char: '😶', name: '无嘴' },
			{ id: 'face_with_rolling_eyes', char: '🙄', name: '白眼' },
			{ id: 'smirk', char: '😏', name: '得意' },
			{ id: 'persevere', char: '😣', name: '坚持' },
			{ id: 'disappointed_relieved', char: '😥', name: '失望' },
			{ id: 'open_mouth', char: '😮', name: '张嘴' },
			{ id: 'zipper_mouth_face', char: '🤐', name: '闭嘴' },
			{ id: 'hushed', char: '😯', name: '安静' },
			{ id: 'sleepy', char: '😪', name: '困' },
			{ id: 'tired_face', char: '😫', name: '累' },
			{ id: 'sleeping', char: '😴', name: '睡觉' },
			{ id: 'relieved', char: '😌', name: '释然' },
			{ id: 'stuck_out_tongue', char: '😛', name: '吐舌' },
			{ id: 'stuck_out_tongue_winking_eye', char: '😜', name: '调皮' },
			{ id: 'stuck_out_tongue_closed_eyes', char: '😝', name: '鬼脸' },
			{ id: 'drooling_face', char: '🤤', name: '流口水' },
			{ id: 'unamused', char: '😒', name: '不高兴' },
			{ id: 'sweat', char: '😓', name: '汗' },
			{ id: 'pensive', char: '😔', name: '沉思' },
			{ id: 'confused', char: '😕', name: '困惑' },
			{ id: 'upside_down_face', char: '🙃', name: '颠倒' },
			{ id: 'money_mouth_face', char: '🤑', name: '财迷' },
			{ id: 'astonished', char: '😲', name: '震惊' }
		]
	},
	{
		id: 'negative',
		name: '负面情绪',
		emojis: [
			{ id: 'frowning_face', char: '☹️', name: '皱眉' },
			{ id: 'slightly_frowning_face', char: '🙁', name: '微皱' },
			{ id: 'confounded', char: '😖', name: '痛苦' },
			{ id: 'disappointed', char: '😞', name: '失望' },
			{ id: 'worried', char: '😟', name: '担心' },
			{ id: 'triumph', char: '😤', name: '胜利' },
			{ id: 'cry', char: '😢', name: '哭泣' },
			{ id: 'sob', char: '😭', name: '大哭' },
			{ id: 'frowning', char: '😦', name: '皱眉' },
			{ id: 'anguished', char: '😧', name: '痛苦' },
			{ id: 'fearful', char: '😨', name: '害怕' },
			{ id: 'weary', char: '😩', name: '疲惫' },
			{ id: 'exploding_head', char: '🤯', name: '爆炸' },
			{ id: 'grimacing', char: '😬', name: '龇牙' },
			{ id: 'cold_sweat', char: '😰', name: '冷汗' },
			{ id: 'scream', char: '😱', name: '尖叫' },
			{ id: 'flushed', char: '😳', name: '脸红' },
			{ id: 'zany_face', char: '🤪', name: '疯狂' },
			{ id: 'dizzy_face', char: '😵', name: '头晕' },
			{ id: 'rage', char: '😡', name: '愤怒' },
			{ id: 'angry', char: '😠', name: '生气' },
			{ id: 'face_with_symbols_on_mouth', char: '🤬', name: '骂人' },
			{ id: 'mask', char: '😷', name: '口罩' },
			{ id: 'face_with_thermometer', char: '🤒', name: '发烧' },
			{ id: 'face_with_head_bandage', char: '🤕', name: '受伤' },
			{ id: 'nauseated_face', char: '🤢', name: '恶心' },
			{ id: 'face_vomiting', char: '🤮', name: '呕吐' },
			{ id: 'sneezing_face', char: '🤧', name: '打喷嚏' },
			{ id: 'innocent', char: '😇', name: '天使' },
			{ id: 'cowboy_hat_face', char: '🤠', name: '牛仔' },
			{ id: 'lying_face', char: '🤥', name: '说谎' },
			{ id: 'shushing_face', char: '🤫', name: '嘘' },
			{ id: 'face_with_hand_over_mouth', char: '🤭', name: '捂嘴' }
		]
	},
	{
		id: 'people',
		name: '人物',
		emojis: [
			{ id: 'monkey_face', char: '🐵', name: '猴脸' },
			{ id: 'see_no_evil', char: '🙈', name: '不看' },
			{ id: 'hear_no_evil', char: '🙉', name: '不听' },
			{ id: 'speak_no_evil', char: '🙊', name: '不说' },
			{ id: 'baby', char: '👶', name: '婴儿' },
			{ id: 'child', char: '🧒', name: '儿童' },
			{ id: 'boy', char: '👦', name: '男孩' },
			{ id: 'girl', char: '👧', name: '女孩' },
			{ id: 'adult', char: '🧑', name: '成人' },
			{ id: 'man', char: '👨', name: '男人' },
			{ id: 'woman', char: '👩', name: '女人' },
			{ id: 'older_adult', char: '🧓', name: '老人' },
			{ id: 'old_man', char: '👴', name: '老爷爷' },
			{ id: 'old_woman', char: '👵', name: '老奶奶' },
			{ id: 'blond_haired_person', char: '👱', name: '金发' },
			{ id: 'bearded_person', char: '🧔', name: '胡子' },
			{ id: 'man_with_chinese_cap', char: '👲', name: '戴帽' },
			{ id: 'person_wearing_turban', char: '👳', name: '头巾' },
			{ id: 'police_officer', char: '👮', name: '警察' },
			{ id: 'construction_worker', char: '👷', name: '工人' },
			{ id: 'guard', char: '💂', name: '卫兵' },
			{ id: 'detective', char: '🕵️', name: '侦探' },
			{ id: 'health_worker', char: '🧑‍⚕️', name: '医护' },
			{ id: 'farmer', char: '🧑‍🌾', name: '农民' },
			{ id: 'cook', char: '🧑‍🍳', name: '厨师' },
			{ id: 'student', char: '🧑‍🎓', name: '学生' },
			{ id: 'singer', char: '🧑‍🎤', name: '歌手' },
			{ id: 'artist', char: '🧑‍🎨', name: '艺术家' },
			{ id: 'teacher', char: '🧑‍🏫', name: '老师' },
			{ id: 'technologist', char: '🧑‍💻', name: '程序员' },
			{ id: 'office_worker', char: '🧑‍💼', name: '白领' }
		]
	},
	{
		id: 'gestures',
		name: '手势',
		emojis: [
			{ id: 'wave', char: '👋', name: '挥手' },
			{ id: 'raised_back_of_hand', char: '🤚', name: '手背' },
			{ id: 'raised_hand_with_fingers_splayed', char: '🖐️', name: '手掌' },
			{ id: 'vulcan_salute', char: '🖖', name: '瓦肯' },
			{ id: 'ok_hand', char: '👌', name: 'OK' },
			{ id: 'v', char: '✌️', name: '胜利' },
			{ id: 'crossed_fingers', char: '🤞', name: '交叉' },
			{ id: 'love_you_gesture', char: '🤟', name: '爱你' },
			{ id: 'metal', char: '🤘', name: '摇滚' },
			{ id: 'call_me_hand', char: '🤙', name: '打电话' },
			{ id: 'point_left', char: '👈', name: '左指' },
			{ id: 'point_right', char: '👉', name: '右指' },
			{ id: 'point_up_2', char: '👆', name: '上指' },
			{ id: 'middle_finger', char: '🖕', name: '中指' },
			{ id: 'point_down', char: '👇', name: '下指' },
			{ id: 'point_up', char: '☝️', name: '食指' },
			{ id: '+1', char: '👍', name: '赞' },
			{ id: '-1', char: '👎', name: '踩' },
			{ id: 'fist_raised', char: '✊', name: '拳头' },
			{ id: 'facepunch', char: '👊', name: '出拳' },
			{ id: 'left_facing_fist', char: '🤛', name: '左拳' },
			{ id: 'right_facing_fist', char: '🤜', name: '右拳' },
			{ id: 'clap', char: '👏', name: '鼓掌' },
			{ id: 'raised_hands', char: '🙌', name: '举手' },
			{ id: 'open_hands', char: '👐', name: '摊手' },
			{ id: 'palms_up_together', char: '🤲', name: '托手' },
			{ id: 'handshake', char: '🤝', name: '握手' },
			{ id: 'pray', char: '🙏', name: '祈祷' },
			{ id: 'writing_hand', char: '✍️', name: '写字' },
			{ id: 'nail_care', char: '💅', name: '美甲' },
			{ id: 'selfie', char: '🤳', name: '自拍' }
		]
	},
	{
		id: 'hearts',
		name: '爱心',
		emojis: [
			{ id: 'heart', char: '❤️', name: '红心' },
			{ id: 'orange_heart', char: '🧡', name: '橙心' },
			{ id: 'yellow_heart', char: '💛', name: '黄心' },
			{ id: 'green_heart', char: '💚', name: '绿心' },
			{ id: 'blue_heart', char: '💙', name: '蓝心' },
			{ id: 'purple_heart', char: '💜', name: '紫心' },
			{ id: 'black_heart', char: '🖤', name: '黑心' },
			{ id: 'broken_heart', char: '💔', name: '心碎' },
			{ id: 'two_hearts', char: '💕', name: '两颗' },
			{ id: 'sparkling_heart', char: '💖', name: '闪亮' },
			{ id: 'heartpulse', char: '💗', name: '跳动' },
			{ id: 'cupid', char: '💘', name: '丘比特' },
			{ id: 'gift_heart', char: '💝', name: '礼物' },
			{ id: 'revolving_hearts', char: '💞', name: '旋转' },
			{ id: 'heart_decoration', char: '💟', name: '装饰' },
			{ id: 'heart_exclamation', char: '❣️', name: '感叹' },
			{ id: 'love_letter', char: '💌', name: '情书' },
			{ id: 'zzz', char: '💤', name: '睡觉' },
			{ id: 'anger', char: '💢', name: '愤怒' },
			{ id: 'bomb', char: '💣', name: '炸弹' },
			{ id: 'boom', char: '💥', name: '爆炸' },
			{ id: 'sweat_drops', char: '💦', name: '汗滴' },
			{ id: 'dash', char: '💨', name: '尾气' },
			{ id: 'dizzy', char: '💫', name: '眩晕' },
			{ id: 'speech_balloon', char: '💬', name: '对话' },
			{ id: 'thought_balloon', char: '💭', name: '思考' },
			{ id: 'right_anger_bubble', char: '🗯️', name: '怒泡' },
			{ id: 'hole', char: '🕳️', name: '洞' },
			{ id: 'eyeglasses', char: '👓', name: '眼镜' },
			{ id: 'dark_sunglasses', char: '🕶️', name: '墨镜' },
			{ id: 'necktie', char: '👔', name: '领带' }
		]
	},
	{
		id: 'animals',
		name: '动物',
		emojis: [
			{ id: 'dog_face', char: '🐶', name: '狗脸' },
			{ id: 'cat_face', char: '🐱', name: '猫脸' },
			{ id: 'mouse_face', char: '🐭', name: '鼠脸' },
			{ id: 'hamster_face', char: '🐹', name: '仓鼠' },
			{ id: 'rabbit_face', char: '🐰', name: '兔脸' },
			{ id: 'fox_face', char: '🦊', name: '狐狸' },
			{ id: 'bear_face', char: '🐻', name: '熊脸' },
			{ id: 'panda_face', char: '🐼', name: '熊猫' },
			{ id: 'koala_face', char: '🐨', name: '考拉' },
			{ id: 'tiger_face', char: '🐯', name: '虎脸' },
			{ id: 'lion_face', char: '🦁', name: '狮脸' },
			{ id: 'cow_face', char: '🐮', name: '牛脸' },
			{ id: 'pig_face', char: '🐷', name: '猪脸' },
			{ id: 'frog_face', char: '🐸', name: '蛙脸' },
			{ id: 'monkey_face', char: '🐵', name: '猴脸' },
			{ id: 'chicken', char: '🐔', name: '鸡' },
			{ id: 'penguin', char: '🐧', name: '企鹅' },
			{ id: 'bird', char: '🐦', name: '鸟' },
			{ id: 'baby_chick', char: '🐤', name: '小鸡' },
			{ id: 'hatching_chick', char: '🐣', name: '破壳' },
			{ id: 'wolf', char: '🐺', name: '狼' },
			{ id: 'boar', char: '🐗', name: '野猪' },
			{ id: 'horse', char: '🐴', name: '马' },
			{ id: 'unicorn', char: '🦄', name: '独角兽' },
			{ id: 'bee', char: '🐝', name: '蜜蜂' },
			{ id: 'bug', char: '🐛', name: '虫子' },
			{ id: 'butterfly', char: '🦋', name: '蝴蝶' },
			{ id: 'snail', char: '🐌', name: '蜗牛' },
			{ id: 'shell', char: '🐚', name: '贝壳' },
			{ id: 'turtle', char: '🐢', name: '乌龟' }
		]
	},
	{
		id: 'food',
		name: '食物',
		emojis: [
			{ id: 'apple', char: '🍎', name: '苹果' },
			{ id: 'green_apple', char: '🍏', name: '青苹' },
			{ id: 'pear', char: '🍐', name: '梨' },
			{ id: 'tangerine', char: '🍊', name: '橘子' },
			{ id: 'lemon', char: '🍋', name: '柠檬' },
			{ id: 'banana', char: '🍌', name: '香蕉' },
			{ id: 'watermelon', char: '🍉', name: '西瓜' },
			{ id: 'grapes', char: '🍇', name: '葡萄' },
			{ id: 'strawberry', char: '🍓', name: '草莓' },
			{ id: 'melon', char: '🍈', name: '甜瓜' },
			{ id: 'cherries', char: '🍒', name: '樱桃' },
			{ id: 'peach', char: '🍑', name: '桃子' },
			{ id: 'pineapple', char: '🍍', name: '菠萝' },
			{ id: 'coconut', char: '🥥', name: '椰子' },
			{ id: 'kiwi_fruit', char: '🥝', name: '猕猴桃' },
			{ id: 'mango', char: '🥭', name: '芒果' },
			{ id: 'avocado', char: '🥑', name: '牛油果' },
			{ id: 'broccoli', char: '🥦', name: '西兰花' },
			{ id: 'tomato', char: '🍅', name: '番茄' },
			{ id: 'eggplant', char: '🍆', name: '茄子' },
			{ id: 'cucumber', char: '🥒', name: '黄瓜' },
			{ id: 'carrot', char: '🥕', name: '胡萝卜' },
			{ id: 'corn', char: '🌽', name: '玉米' },
			{ id: 'hot_pepper', char: '🌶️', name: '辣椒' },
			{ id: 'potato', char: '🥔', name: '土豆' },
			{ id: 'sweet_potato', char: '🍠', name: '红薯' },
			{ id: 'chestnut', char: '🌰', name: '栗子' },
			{ id: 'peanuts', char: '🥜', name: '花生' },
			{ id: 'honey_pot', char: '🍯', name: '蜂蜜' }
		]
	},
	{
		id: 'nature',
		name: '自然',
		emojis: [
			{ id: 'sunny', char: '☀️', name: '太阳' },
			{ id: 'mostly_sunny', char: '🌤️', name: '多云' },
			{ id: 'barely_sunny', char: '🌥️', name: '少云' },
			{ id: 'partly_sunny_rain', char: '🌦️', name: '雨' },
			{ id: 'cloud', char: '☁️', name: '云' },
			{ id: 'rain_cloud', char: '🌧️', name: '雨云' },
			{ id: 'snow_cloud', char: '🌨️', name: '雪云' },
			{ id: 'lightning', char: '🌩️', name: '雷电' },
			{ id: 'tornado', char: '🌪️', name: '龙卷风' },
			{ id: 'fog', char: '🌫️', name: '雾' },
			{ id: 'wind_face', char: '🌬️', name: '风' },
			{ id: 'cyclone', char: '🌀', name: '旋风' },
			{ id: 'rainbow', char: '🌈', name: '彩虹' },
			{ id: 'closed_umbrella', char: '🌂', name: '伞' },
			{ id: 'umbrella', char: '☂️', name: '雨伞' },
			{ id: 'umbrella_with_rain_drops', char: '☔', name: '下雨' },
			{ id: 'high_voltage', char: '⚡', name: '闪电' },
			{ id: 'snowflake', char: '❄️', name: '雪花' },
			{ id: 'snowman', char: '☃️', name: '雪人' },
			{ id: 'snowman_without_snow', char: '⛄', name: '小雪人' },
			{ id: 'comet', char: '☄️', name: '彗星' },
			{ id: 'fire', char: '🔥', name: '火' },
			{ id: 'droplet', char: '💧', name: '水滴' },
			{ id: 'ocean', char: '🌊', name: '海浪' },
			{ id: 'new_moon', char: '🌑', name: '新月' },
			{ id: 'waxing_crescent_moon', char: '🌒', name: '眉月' },
			{ id: 'first_quarter_moon', char: '🌓', name: '上弦' },
			{ id: 'waxing_gibbous_moon', char: '🌔', name: '盈凸' },
			{ id: 'full_moon', char: '🌕', name: '满月' },
			{ id: 'waning_gibbous_moon', char: '🌖', name: '亏凸' }
		]
	},
	{
		id: 'objects',
		name: '物品',
		emojis: [
			{ id: 'gift', char: '🎁', name: '礼物' },
			{ id: 'tada', char: '🎉', name: '庆祝' },
			{ id: 'confetti_ball', char: '🎊', name: '彩球' },
			{ id: 'balloon', char: '🎈', name: '气球' },
			{ id: 'crown', char: '👑', name: '皇冠' },
			{ id: 'gem', char: '💎', name: '宝石' },
			{ id: 'ring', char: '💍', name: '戒指' },
			{ id: 'lipstick', char: '💄', name: '口红' },
			{ id: 'bomb', char: '💣', name: '炸弹' },
			{ id: 'zzz', char: '💤', name: '睡觉' },
			{ id: 'boom', char: '💥', name: '爆炸' },
			{ id: 'sweat_drops', char: '💦', name: '汗滴' },
			{ id: 'dash', char: '💨', name: '尾气' },
			{ id: 'dizzy', char: '💫', name: '眩晕' },
			{ id: 'speech_balloon', char: '💬', name: '对话' },
			{ id: 'thought_balloon', char: '💭', name: '思考' },
			{ id: '100', char: '💯', name: '满分' },
			{ id: 'anger', char: '💢', name: '愤怒' },
			{ id: 'hole', char: '🕳️', name: '洞' },
			{ id: 'shopping_bags', char: '🛍️', name: '购物袋' },
			{ id: 'prayer_beads', char: '📿', name: '念珠' },
			{ id: 'gem_stone', char: '💎', name: '宝石' },
			{ id: 'postal_horn', char: '📯', name: '邮号' },
			{ id: 'studio_microphone', char: '🎙️', name: '麦克风' },
			{ id: 'level_slider', char: '🎚️', name: '滑块' },
			{ id: 'control_knobs', char: '🎛️', name: '旋钮' },
			{ id: 'stopwatch', char: '⏱️', name: '秒表' },
			{ id: 'timer_clock', char: '⏲️', name: '定时器' },
			{ id: 'alarm_clock', char: '⏰', name: '闹钟' },
			{ id: 'mantelpiece_clock', char: '🕰️', name: '座钟' }
		]
	}
]


function getAllEmojisFlat(): EmojiItem[] {
	const allEmojis: EmojiItem[] = []
	EMOJI_CATEGORIES.forEach(category => {
		allEmojis.push(...category.emojis)
	})
	return allEmojis
}


export function getEmojiCategories(): Array<{ id: string; name: string }> {
	return EMOJI_CATEGORIES.map(cat => ({
		id: cat.id,
		name: cat.name
	}))
}


export function getEmojisByCategory(categoryId: string): EmojiItem[] {
	const category = EMOJI_CATEGORIES.find(cat => cat.id === categoryId)
	return category ? category.emojis : []
}


export function getEmojiList(): EmojiItem[] {
	return getAllEmojisFlat()
}


export function getEmojiChar(emojiId: string): string | null {
	const emoji = getAllEmojisFlat().find(e => e.id === emojiId)
	return emoji ? emoji.char : null
}


export function getAllEmojis(): Record<string, string> {
	const map: Record<string, string> = {}
	getAllEmojisFlat().forEach(emoji => {
		map[emoji.id] = emoji.char
	})
	return map
}


const EMOJI_REGEX = /\[emoji:(\w+)\]/g


export function parseEmojiContent(content: string): string {
	if (!content) return content
	return content.replace(EMOJI_REGEX, (match: string, emojiId: string) => {
		return getEmojiChar(emojiId) || match
	})
}


export function encodeEmojiChar(char: string): string {
	const emoji = getAllEmojisFlat().find(e => e.char === char)
	return emoji ? `[emoji:${emoji.id}]` : char
}

export default {
	getEmojiCategories,
	getEmojisByCategory,
	getEmojiList,
	getEmojiChar,
	getAllEmojis,
	parseEmojiContent,
	encodeEmojiChar,
	EMOJI_REGEX
}
