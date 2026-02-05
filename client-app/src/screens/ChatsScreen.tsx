import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import eagle from '../../assets/eagle.png';
import trump from '../../assets/DonaldTrump.png';
import musk from '../../assets/ElonMask.png';
import kanye from '../../assets/KaneyWest.png';
import nixon from '../../assets/RichardNixon.png';
import jackson from '../../assets/AndrewJackson.png';
import greene from '../../assets/MarjorieTaylorGreene.png';
import tucker from '../../assets/TuckerCarlson.png';
import lbj from '../../assets/LyndonBJohnson.png';
import zuck from '../../assets/MarkZuckerberg.png';
import epstein from '../../assets/JeffreyEpstein.png';

const personas = [
  { name: 'Donald Trump', avatar: trump },
  { name: 'Elon Musk', avatar: musk },
  { name: 'Kanye West', avatar: kanye },
  { name: 'Richard Nixon', avatar: nixon },
  { name: 'Andrew Jackson', avatar: jackson },
  { name: 'Marjorie Taylor Greene', avatar: greene },
  { name: 'Tucker Carlson', avatar: tucker },
  { name: 'Lyndon B. Johnson', avatar: lbj },
  { name: 'Mark Zuckerberg', avatar: zuck },
  { name: 'Jeffrey Epstein', avatar: epstein },
];

export default function ChatsScreen({ onOpenChat }: { onOpenChat: (name: string) => void }) {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerBrand}>Trumpus</Text>
      </View>

      <ScrollView contentContainerStyle={styles.listWrap}>
        {personas.map((p) => (
          <Pressable key={p.name} style={styles.row} onPress={() => onOpenChat(p.name)}>
            <Image source={p.avatar} style={styles.avatar} />
            <View style={styles.rowText}>
              <View style={styles.rowTop}>
                <Text style={styles.rowName}>{p.name}</Text>
                <Text style={styles.rowTime}>23:43</Text>
              </View>
              <Text style={styles.rowPreview}>Tap to start chatting</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <Pressable style={styles.fab}>
        <Image source={eagle} style={styles.fabIcon} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0b0b0b',
  },
  header: {
    height: 56,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
    justifyContent: 'center',
  },
  headerBrand: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  listWrap: {
    padding: 12,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#111214',
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  rowText: {
    flex: 1,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowName: {
    color: '#ffffff',
    fontWeight: '700',
  },
  rowTime: {
    color: '#94a3b8',
    fontSize: 12,
  },
  rowPreview: {
    color: '#94a3b8',
    marginTop: 4,
    fontSize: 13,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#bf0a30',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#bf0a30',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabIcon: {
    width: 28,
    height: 28,
    tintColor: '#fff',
  },
});
